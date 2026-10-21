# Laporan fondasi K-01/K-03

Tanggal audit: 21 Oktober 2026.

## Kondisi awal

Branch `main`, tracked tree hanya `LICENSE` dan dokumen proyek. Untracked sudah ada `package.json`, `package-lock.json`, `node_modules/`, dan `supabase/`; tidak ada React/Vite, migration, README, env example, atau ignore. Supabase CLI lokal 2.121.0. Perubahan untracked dipertahankan dan tidak ada file `.env` dibaca/dicetak.

## Perubahan

- React/Vite, router, CSS modular, Lucide, Supabase JS, ESLint/Vitest dan struktur `src/` oleh fondasi K-01.
- `.gitignore`, `.env.example`, `README.md`.
- `supabase/config.toml`: port lokal API 56321, DB 56322, shadow 56320, Studio 56323, SMTP UI 56324; dipilih karena 54322 dipakai project Docker lain dan Windows mengecualikan 55305–55404. Seed default dimatikan karena belum ada seed.
- `supabase/migrations/20261021140000_foundation.sql` dan `20261021150000_publication_metadata.sql` (hardening metadata dan revoke DELETE messages).
- `supabase/tests/foundation.sql`.
- `docs/API-CONTRACT.md`, `docs/DATABASE.md`.

## Dependency

`react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `lucide-react`: runtime fondasi UI, routing, client Supabase publishable-key only, ikon. `vite`, `@vitejs/plugin-react`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `vitest`, `jsdom`: dev/build/lint/test aktual. Existing `supabase` CLI dependency dipertahankan.

## Database dan keamanan

`messages`, `publication_jobs`, `idempotency_receipts`, projection `published_messages`; check constraints kategori/status/length/URL/hash, unique request/tracking/public_id/media/job, FK cascade, indexes partial feed/due/lease, triggers timestamp/state transition/transactional outbox, receipt TTL 24 jam, pg_cron purge hourly. Message published wajib timestamp dan media ID. `message_likes` ditunda P1.

RLS aktif pada semua tabel internal. Grants PUBLIC/anon/authenticated dicabut pada tabel, view, dan helper functions; tidak ada policies sebagai default-deny. Hanya `service_role` mendapat akses server-side. View security invoker/barrier hanya mengembalikan field published publik; browser tetap harus memakai Edge Functions. Tidak ada SECURITY DEFINER, policy `USING(true)`, service-role frontend, tracking plaintext, token, atau HMAC secret pada migration.

## Supabase cloud

CLI login terverifikasi tanpa mencetak token. Project `Menfess-Spenthree`, ref `tjhzcyeifrxyukcrpfsi`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`, linked dan database PostgreSQL 17.11.0.003. Sebelum perubahan migration cloud kosong (`migration list --linked` empty). `db push --linked --dry-run` memverifikasi satu migration akan diterapkan. **Kedua migration sudah diterapkan dan terverifikasi pada cloud development**. `migration list --linked` cocok dengan lokal; tes SQL remote dan db lint lulus; db push kedua no-op. Jadwal cron purge aktif satu, dan hitungan messages/jobs/receipts sesudah tes seluruhnya nol (fixture rollback). Tidak ada project duplikat dibuat.

## Tes yang dijalankan / status

- `npx supabase --version`: PASS, 2.121.0.
- `npx supabase projects list`: PASS, project linked ditemukan; nama/ref/region/status dicetak, tanpa credential.
- `npx supabase migration list --linked`: PASS, awalnya kosong.
- `npx supabase db push --linked --dry-run`: PASS, migration terdeteksi, tidak apply.
- Local Supabase start database-only: PASS sesudah memindahkan port ke 563xx. Dua percobaan awal gagal karena 54322 dipakai project lain dan 55322 dicadangkan Windows. Tidak ada container proyek lain dihentikan.
- Database kosong lokal: migration awal diterapkan otomatis oleh start; migration kedua lewat `db push --local`: PASS.
- `npx supabase db query --local --file supabase/tests/foundation.sql`: PASS. Versi awal tes multi-statement ditolak prepared statement CLI; diubah menjadi single DO dengan rollback subtransaksi, lalu lulus.
- `npx supabase db lint --local --fail-on warning`: PASS, tidak ada schema error.
- `npx supabase db push --local` kedua: PASS, up to date tanpa workaround destruktif.
- `npx supabase db push --linked --dry-run`, lalu `db push --linked --yes`: PASS, dua migration diterapkan.
- `npx supabase migration list --linked`: PASS, kedua versi cocok.
- `npx supabase db query --linked --file supabase/tests/foundation.sql`: PASS, seluruh assertion constraints/role access lulus.
- `npx supabase db lint --linked --fail-on warning`: PASS, tidak ada schema error.
- `npx supabase db push --linked --yes` kedua: PASS, up to date.
- Verifikasi remote read-only: 0 messages/jobs/receipts sisa fixture dan 1 cron purge aktif.
- `npm run lint`: PASS, tanpa warning.
- `npm test`: PASS, 16 tes dalam 2 file.
- `npm run build`: PASS, Vite 7.3.7, bundle JS 269.59 kB (gzip 86.20 kB).
- `npm audit --omit=dev`: PASS, 0 vulnerabilities runtime.
- `git diff --check`: PASS untuk tracked diff; file baru tetap untracked, belum commit. `.temp` dan node_modules terverifikasi ignored.
- Versi terpasang: Node 22.19.0, React 19.3.1, Router 7.18.4, Lucide 1.61.0, Supabase JS 2.118.0, Vitest 4.1.12, ESLint 9.39.5. Versi lengkap terkunci di package-lock.json.
- Belum diuji: HTTP browser/Data API end-to-end, concurrency/replay endpoint, visual Figma dan perangkat nyata. Endpoint belum ada; pengujian role SQL tidak diklaim sebagai tes HTTP.

## Manual steps / belum selesai

1. Pada mesin Reiner, jalankan npm ci dan salin .env.example ke .env.local dengan URL/publishable key dari dashboard. Jangan membagikan credential lewat chat.
2. Migration dev dan tes SQL sudah selesai. Review perubahan melalui PR sebelum merge; tidak ada commit/push pada sesi ini. Database-only container proyek ini masih berjalan di port 56322, dapat dihentikan sendiri nanti lewat workflow CLI proyek tanpa menyentuh proyek Docker lain.
3. Implementasikan K-04: Edge Function submit dengan schema strict, HMAC secret server, AEAD receipt, transaksi atomic, rate limiting, dan tracking POST.
4. Implementasikan K-05 feed/detail dan gunakan published projection; K-06 worker/renderer/Instagram belum dimulai. Tidak ada endpoint Instagram prematur.
5. Putuskan retensi messages/jobs/aset dan kebijakan publikasi dengan pemilik/sekolah sebelum menambah cron penghapusan.

## Rekomendasi berikutnya untuk Kiandra

Lanjutkan K-04 sebagai vertical slice submit/idempotency di atas database dev yang sudah terverifikasi. Setelah itu K-05 contract tests, baru K-02 Instagram access spike dan K-06 publisher. Jangan membuka grants browser ke tabel internal untuk mempercepat UI.
