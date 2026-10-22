# Menfess Spenthree

Alur kirim terbaru: pesan yang lolos validasi dan filter lokal langsung disimpan privat dan mendapat kode pelacakan, tanpa menunggu AI. Pemeriksaan dan publikasi berlangsung melalui worker terpisah. Lihat [antrean moderasi](docs/MODERATION-QUEUE.md) untuk perilaku, batas kapasitas, serta langkah deployment. Catatan fondasi di bawah merekam tahap awal proyek.

Fondasi K-01/K-03: React + Vite (JavaScript), React Router, CSS Modules, Lucide React, Supabase PostgreSQL 17. Tanpa login pengguna atau panel admin/moderator. UI hanya placeholder teknis untuk dilanjutkan Reiner; endpoint submit/feed/detail/tracking dan publisher Instagram **belum diimplementasikan**.

## Persiapan

- Node.js 22 LTS terbaru (minimal 22.12) dan npm. Gunakan npm/package-lock.json, jangan menambahkan lockfile package manager kedua.
- Supabase CLI sudah menjadi devDependency lokal, jalankan dengan `npx supabase`; tidak perlu instal global.
- Docker hanya diperlukan untuk Supabase lokal. Jangan mengubah layanan/proyek Docker lain untuk menjalankan proyek ini.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Isi `.env.local` sendiri dari Supabase dashboard Connect/API Keys:

- `VITE_SUPABASE_URL`: URL project development.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: publishable key atau legacy anon key yang memang untuk browser.

Jangan masukkan service_role, sb_secret, database password, access token CLI, maupun token Meta ke variabel VITE atau Git. Dua variabel frontend bersifat publik; bukan autentikasi pengguna. Aplikasi placeholder dapat dibuka tanpa env; client membutuhkan env valid ketika nanti dipakai service API. Client tidak membuat sesi login.

```powershell
npm run lint
npm test
npm run build
```

`npm run dev` menjalankan Vite. Production build di `dist/`. Host statis harus mengarahkan route non-file ke index.html untuk BrowserRouter; deployment final termasuk pekerjaan K-08.

## Struktur dan kerja bersama

- `src/App.jsx`: router; `src/components/AppLayout.jsx`: shell aplikasi.
- `src/pages/`: placeholder halaman utama, bukan desain final.
- `src/components/`: komponen bersama; `src/lib/`: client Supabase; `src/services/`: batas integrasi API.
- Gunakan CSS Modules sebagai satu sistem styling; global CSS hanya reset/base. Reiner melanjutkan design tokens dan komponen Figma tanpa menambah Tailwind.
- `supabase/config.toml`: konfigurasi lokal yang sudah ada, dilengkapi tanpa inisialisasi ulang.
- `supabase/migrations/`: SQL version-controlled, jangan edit setelah diterapkan.
- `supabase/tests/foundation.sql`: tes integritas/akses dengan rollback fixture dalam subtransaksi DO.
- [Kontrak untuk Reiner](docs/API-CONTRACT.md), [database dan keamanan](docs/DATABASE.md), [hasil audit/tes](docs/FOUNDATION-REPORT.md).
- Dokumen produk berada di `.Menfess-Spenthree/`; referensi `.PRD/` dalam task lama bukan path aktif.

Gunakan branch `feature/<nama-task>` dan PR ke main dengan hasil lint/test/build, perubahan kontrak, serta review anggota lain. Tidak commit/push otomatis. Jangan menimpa perubahan lokal anggota lain.

## Supabase cloud development

Saat audit, CLI 2.121.0 sudah login dan project bernama **Menfess-Spenthree**, ref `tjhzcyeifrxyukcrpfsi`, region `ap-northeast-1`, sudah linked. Jangan membuat duplikat. Hasil penerapan ada di laporan; jangan menganggap state cloud selalu sama dengan laporan lama.

Pada mesin baru:

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref tjhzcyeifrxyukcrpfsi
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db query --linked --file supabase/tests/foundation.sql
npx supabase db lint --linked
```

Login resmi membuka browser; ikuti verifikasi CLI. Jangan kirim token/password ke chat atau memasukkannya dalam command argument/history. Jika CLI meminta password DB, gunakan prompt aman atau secret manager sesuai dokumentasi CLI, bukan file repository. Jika akses ditolak, pemilik harus memberi akses organisasi/project melalui dashboard. Tidak ada kebutuhan project baru/billing pada fondasi ini.

`db push` berikutnya no-op jika riwayat sudah cocok. Perubahan skema selanjutnya memakai `npx supabase migration new nama_perubahan`. Jangan reset remote atau menjalankan ulang migration SQL awal secara manual.

## Supabase lokal

```powershell
npx supabase start
npx supabase db query --local --file supabase/tests/foundation.sql
npx supabase db lint --local
```

`start` menerapkan migration pada database lokal baru. Port database proyek ini **56322**, shadow 56320 karena 54322 sudah dipakai layanan lain dan rentang 55305–55404 dicadangkan Windows. API 56321, Studio 56323, SMTP 56324. Bila port masih berbenturan, pilih port kosong pada config, jangan menghentikan container proyek lain. Hindari menyalin output start/status yang berisi key ke laporan/chat. Database-only start untuk mengurangi resource:

```powershell
npx supabase start --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

Database-only cukup untuk tes SQL, bukan pengujian browser/Data API. Tidak perlu db reset; gunakan migration normal, termasuk saat menjalankan ulang. `pg_cron` membersihkan receipt terenkripsi setiap jam; implementasi enkripsi, validasi TTL replay, dan transaksi submit server-only diselesaikan K-04. Retensi pesan/job/aset butuh kebijakan pemilik sebelum rilis.

## Batas tahap ini

Backend nantinya memakai secret server untuk akses service_role ke tiga tabel internal. Browser hanya memanggil Edge Functions yang tervalidasi; tidak diberi SELECT/INSERT/UPDATE/DELETE internal. RLS dan grants ditulis eksplisit dalam migration. Feed/detail memakai proyeksi published-only. Tidak ada secret tracking/enkripsi yang ditanam dalam SQL atau frontend.

Lanjutkan K-02 verifikasi Instagram API secara terpisah, K-04 transaksi submit + tracking + anti-abuse, kemudian K-05 feed/detail. Jangan menyatakan publikasi Instagram siap sebelum spike API dan worker benar-benar diuji.

## Proses Pengembangan

Dimana Projek ini masih dalam tahap perkembangan.
