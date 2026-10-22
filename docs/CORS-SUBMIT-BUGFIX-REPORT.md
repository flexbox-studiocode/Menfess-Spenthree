# CORS dan submit production — 22 Oktober 2026

## Audit dan penyebab

- Commit awal: `0177aa8`; working tree awal bersih.
- Project linked diverifikasi `tjhzcyeifrxyukcrpfsi`. Empat migrasi awal cocok dengan remote.
- Bundle JavaScript production Vercel menggunakan URL project yang benar. Publishable key bundle dibandingkan di memori dengan daftar key project melalui CLI: cocok, tanpa mencetak key. Pengaturan environment dashboard Vercel tidak diakses langsung.
- CORS lama tidak mencakup `apikey` dan `x-client-info`, hanya mendukung satu origin, dan OPTIONS mengembalikan 200.
- Tracking menyamakan error database dengan hasil lookup kosong.
- Setelah CORS diperbaiki, submit aktual menghasilkan 409 RECEIPT_EXPIRED. Pemeriksaan database membuktikan message dan job dibuat, tetapi receipt tidak ada. RPC migration 20261021180000 mengecek tombstone setelah INSERT tanpa membedakan INSERT baru dari konflik; semua request baru salah dianggap kedaluwarsa.

## Perubahan

- `supabase/functions/_shared/http.ts`: CORS per request, exact allowlist, konfigurasi koma, origin production tetap, origin lokal hanya jika dikonfigurasi, penolakan wildcard, Vary Origin, no-store, logging metadata tanpa error message/detail.
- `supabase/functions/submit-menfess/index.ts`: CORS seluruh response, OPTIONS 204, correlation ID dan stage pada internal error.
- `supabase/functions/track-menfess/index.ts`: CORS seluruh response, OPTIONS 204, validasi konfigurasi, logging aman, error database menjadi 500; lookup kosong menjadi 404.
- `supabase/migrations/20261022030000_fix_new_submit_receipt.sql`: perbaikan RPC tambahan memakai FOUND langsung setelah INSERT. Guard receipt kedaluwarsa tetap berlaku. Migrasi lama tidak diubah; grants dan RLS tidak dibuka.
- `supabase/tests/submit_receipt_regression.sql`: regresi receipt baru, replay, payload berbeda, tombstone, satu queued job; fixture di-rollback.
- `src/test/edge-handlers.test.js`: regresi CORS, handler, receipt, dan logging aman.

## Deployment dan konfigurasi

- Hanya secret CORS_ORIGIN diperbarui. Nilainya tidak dicantumkan dalam laporan.
- Kedua Edge Functions berhasil dideploy ulang ke project yang diharapkan, termasuk setelah pengetatan wildcard.
- Endpoint tetap anonim dengan verify_jwt=false sesuai konfigurasi existing. Validasi payload dan akses tabel internal tidak dilonggarkan.
- Migrasi tambahan diterapkan setelah dry-run; riwayat kelima migrasi lokal/remote cocok.

## Bukti production

Preflight kedua endpoint setelah deployment terakhir:

- HTTP 204.
- Access-Control-Allow-Origin persis `https://menfess-spenthree-eight.vercel.app`.
- Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type.
- Methods POST, OPTIONS; Vary memuat Origin.
- Kedua origin lokal yang dikonfigurasi lulus. Origin tidak diizinkan tidak menerima Access-Control-Allow-Origin.

Submit sintetis menggunakan Supabase JS, key dari bundle production, dan Origin production:

- Request ID sukses: `34d5ca66-4414-44ee-84de-cf9b5051e0f8`.
- Submit HTTP 202, accepted=true, tracking code diberikan server (tidak dicetak).
- Tracking HTTP 200, queued, published_at dan ig_permalink null.
- Kode acak format valid: HTTP 404 NOT_FOUND tanpa data pesan.
- Dua retry paralel: HTTP 202, tracking code sama.
- Request ID sama dengan payload berbeda: HTTP 409 IDEMPOTENCY_CONFLICT.
- Query database: tepat 1 message queued, 1 publication job queued, 1 receipt untuk request sukses.
- Replay dan tracking setelah deployment terakhir kembali lulus 202/200 tanpa menambah pesan sintetis baru.

Fixture uji pertama sebelum perbaikan RPC, request `431e235f-e0dd-40fb-bcb1-61779c235f21`, tetap memiliki 1 queued message dan 1 queued job tanpa receipt. Tidak dihapus atau dimodifikasi. Guard tombstone sengaja tidak memulihkan receipt lama.

## Quality gate dan batas verifikasi

- npm run lint: lulus.
- npm test: 87 tes lulus dalam 5 file.
- npm run build: lulus; warning bundle frontend sekitar 511 kB, bukan blocker submit.
- Database regression melalui CLI linked: berhasil tanpa SQL error; fixture rollback.
- db lint --linked --fail-on warning: lulus, tidak ada schema error.
- git diff --check: lulus; hanya warning normalisasi LF/CRLF.
- Tidak ada reset database, penghapusan data, perubahan status published, atau perubahan secret lain.
- Tidak ada credential ditulis ke file perubahan; nilai key hanya dibandingkan dalam memori.
- Uji production adalah integrasi HTTP melalui Supabase JS, bukan klik form di browser otomatis. Browser UI end-to-end dan pembacaan langsung environment dashboard Vercel belum diverifikasi. Bundle production dan kecocokan key/URL sudah diverifikasi.
- Tidak ada blocker yang tersisa pada alur HTTP submit/tracking yang diuji. Publisher Instagram di luar cakupan.
