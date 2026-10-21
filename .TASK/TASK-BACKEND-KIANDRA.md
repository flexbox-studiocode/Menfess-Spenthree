# Task Implementasi — Backend & Delivery (Kiandra)

**Pemilik:** Kiandra (@KiandrAHD)  
**Peran:** Setup awal, Backend Full, integrasi backend–frontend, QA teknis, dan hosting Vercel.  
**Dokumen acuan:** `.PRD/ARSITEKTUR_MENFESS_SPENTHREE.md`, `.PRD/PLAN-Menfess-Spenthree.md`, `.PRD/PRD-Menfess-Spenthree.md`.

> Produk tidak memiliki login pengirim, panel admin, atau panel moderator. Publikasi Instagram berjalan otomatis setelah validasi server berhasil. Tidak ada approval manual. Akses Supabase/Meta untuk pemilik teknis hanya lewat dashboard/provider, bukan panel dalam aplikasi.

## Task K-01 — Setup awal proyek

- [ ] Inisialisasi React + Vite dan konfirmasi struktur folder yang akan dipakai bersama.
- [ ] Pilih satu styling system: Tailwind CSS atau CSS modular.
- [ ] Pasang React Router, Lucide React, dan dependensi dasar yang disepakati.
- [ ] Siapkan scripts dev/build/lint/test.
- [ ] Buat `.gitignore`, `.env.example`, dan README setup lokal.
- [ ] Tetapkan branch dan aturan PR.
- [ ] Sepakati kontrak awal frontend–backend: kategori, status, endpoint, payload, response, dan error shape.
- [ ] Jangan menyimpan secrets di Git atau variabel `VITE_*` yang bersifat rahasia.

**Selesai jika:** anggota tim lain dapat menjalankan proyek dari README, build berhasil, kontrak integrasi terdokumentasi, dan repository tidak memuat secret.

## Task K-02 — Verifikasi Instagram API

- [ ] Pastikan akun tujuan merupakan tipe akun profesional yang sesuai dan akses Meta Developer tersedia.
- [ ] Verifikasi metode autentikasi, izin publikasi, token, dan versi API yang berlaku.
- [ ] Simpan token sebagai server secret, bukan frontend.
- [ ] Buat satu gambar uji dan buktikan satu publikasi percobaan melalui API.
- [ ] Dokumentasikan kendala akses, batas publikasi, lifecycle token, dan cara refresh/rotasi.

**Selesai jika:** posting percobaan berhasil dan langkah autentikasi dapat diulang. Jika belum berhasil, tandai blocker sebelum membangun pipeline penuh.

## Task K-03 — Schema Supabase dan keamanan database

- [ ] Buat migrasi untuk `messages`, `publication_jobs`/outbox, dan tabel opsional `message_likes`.
- [ ] Tetapkan kategori dan status sesuai PRD.
- [ ] Simpan tracking code sebagai hash/HMAC; jangan simpan kode mentah.
- [ ] Tambahkan request ID/idempotency, indeks, timestamps, media ID, permalink, dan error code minimum.
- [ ] Terapkan RLS dan SQL grants minimum.
- [ ] Tutup akses anonim langsung ke tabel internal.
- [ ] Tentukan retensi pesan, job, dan aset gambar.
- [ ] Tambahkan tes akses untuk pengguna anonim.

**Selesai jika:** migrasi berjalan pada database development bersih, feed bisa dibatasi ke status `published`, dan klien tidak bisa mengubah status atau metadata internal.

## Task K-04 — Endpoint submit anonim, validasi, anti-spam, dan tracking

- [ ] Implementasikan Edge Function `submit-menfess`.
- [ ] Validasi di server: kategori allowlist, batas panjang, recipient opsional, payload, persetujuan publikasi, dan aturan konten.
- [ ] Terapkan rate limiting/anti-spam; CAPTCHA/challenge dapat ditambahkan jika diperlukan.
- [ ] Terapkan idempotensi agar klik ganda/retry tidak menghasilkan pesan/job ganda.
- [ ] Generate kode tracking acak yang cukup kuat; kode mentah dikembalikan hanya setelah submit.
- [ ] Simpan pesan dan publication job secara konsisten.
- [ ] Kembalikan acknowledgement cepat setelah job tersimpan, tanpa menunggu Instagram selesai.
- [ ] Implementasikan endpoint status menggunakan POST body agar kode tidak masuk URL.
- [ ] Berikan respons error generik yang tidak membocorkan data internal.

**Selesai jika:** payload valid menghasilkan satu pesan dan satu job; payload tidak valid ditolak; tracking tidak mengungkap data pesan lain; submit tidak menunggu publish selesai.

## Task K-05 — Feed publik dan detail menfess

- [ ] Implementasikan endpoint feed dengan pagination/cursor dan filter kategori.
- [ ] Implementasikan endpoint detail untuk menfess yang telah dipublikasikan.
- [ ] Kembalikan hanya kolom publik yang disepakati.
- [ ] Jangan pernah mengembalikan data `pending`/`processing`/`failed`/`blocked` di feed publik.
- [ ] Dokumentasikan tipe response/contoh JSON untuk Reiner.
- [ ] Uji kategori tidak valid, cursor invalid, empty state dan kegagalan database.

**Selesai jika:** frontend dapat memakai mock contract yang sama dan hanya pesan `published` yang dapat dibaca publik.

## Task K-06 — Renderer, antrean, dan Instagram publisher

- [ ] Pilih renderer yang kompatibel dengan runtime terpilih melalui uji teknis singkat.
- [ ] Generate gambar JPEG dari teks menfess menggunakan template visual yang disepakati.
- [ ] Uji wrapping, teks panjang, Unicode, font fallback, ukuran, rasio dan kontras.
- [ ] Simpan gambar yang akan dipublikasikan pada storage/URL yang bisa diakses Instagram.
- [ ] Implementasikan worker untuk mengklaim job secara atomik.
- [ ] Buat media container, cek readiness, lalu publish melalui Instagram API.
- [ ] Simpan media ID, permalink jika tersedia, dan waktu sukses.
- [ ] Implementasikan retry terbatas dengan exponential backoff.
- [ ] Rekonsiliasi hasil timeout/ambigu sebelum retry agar tidak mengirim posting ganda.
- [ ] Pastikan secret tidak masuk log atau database yang bisa diakses publik.

**Selesai jika:** pesan valid berhasil dipublikasikan melalui API, status berubah menjadi `published` setelah dikonfirmasi, dan kegagalan bisa ditangani tanpa duplicate publish.

## Task K-07 — Integrasi backend ke frontend (tanggung jawab Kiandra)

- [ ] Review hasil frontend Reiner terhadap kontrak API.
- [ ] Buat/rapikan service layer untuk submit, status, feed dan detail.
- [ ] Hubungkan form dan halaman preview dengan endpoint submit.
- [ ] Hubungkan halaman status dengan tracking endpoint.
- [ ] Hubungkan feed, filter dan detail dengan endpoint publik.
- [ ] Implementasikan mapping status `queued`, `processing`, `publishing`, `published`, `retry_scheduled`, `failed`, dan `blocked`.
- [ ] Tambahkan polling status terbatas dengan backoff; berhenti untuk status terminal.
- [ ] Uji loading, empty, network error, timeout dan respons tak valid.
- [ ] Pastikan jalur utama tidak memakai data dummy.
- [ ] Uji alur submit sampai posting muncul di Instagram dan feed website.

**Selesai jika:** alur end-to-end berfungsi pada staging dan semua state utama ditangani dengan benar.

## Task K-08 — Hosting Vercel, deployment, dan rilis

- [ ] Hubungkan repository ke Vercel.
- [ ] Konfigurasikan build dan SPA rewrite bila dibutuhkan oleh React Router.
- [ ] Pisahkan environment staging dan production.
- [ ] Masukkan hanya URL Supabase dan publishable key di environment frontend.
- [ ] Simpan secrets backend di lokasi server-side yang sesuai.
- [ ] Terapkan migrasi production melalui prosedur terkendali.
- [ ] Atur CORS dan domain; jangan menganggap CORS menggantikan rate limit/keamanan server.
- [ ] Jalankan smoke test dari URL Vercel.
- [ ] Verifikasi publikasi Instagram di environment yang benar.
- [ ] Dokumentasikan rollback dan rotasi token.

**Selesai jika:** deployment berjalan, refresh route tidak 404, secrets aman dan smoke test lolos.

## Task K-09 — QA teknis dan release gate

- [ ] Uji kategori/input invalid, batas panjang, spam dan klik ganda.
- [ ] Uji akses database langsung dan RLS/grants.
- [ ] Uji tracking code salah/valid dan percobaan berulang.
- [ ] Uji API Instagram: token expired, permission kurang, rate limit, media URL gagal dan timeout.
- [ ] Uji pencegahan duplikasi publikasi pada retry.
- [ ] Periksa frontend bundle, source map publik, log dan Git history dari secrets.
- [ ] Uji responsivitas pada HP dan desktop.
- [ ] Pastikan kebijakan privasi, aturan konten, dan panduan tersedia.
- [ ] Catat temuan yang tersisa dan putuskan readiness untuk rilis.

**Selesai jika:** jalur kritis lulus, tidak ada masalah keamanan kritis yang diketahui, dan checklist rilis bisa diulang.

## Urutan dependensi yang disarankan

1. K-01 Setup awal dan kontrak data.
2. K-02 Verifikasi akses Instagram (dapat berjalan paralel setelah akses akun tersedia).
3. K-03 Schema/RLS.
4. K-04 Submit dan tracking.
5. K-05 Feed/detail API.
6. K-06 Publisher worker dan renderer.
7. K-07 Integrasi frontend–backend setelah frontend Reiner siap.
8. K-08 Deployment Vercel dan environment.
9. K-09 QA final dan release gate.

Reiner bertanggung jawab atas implementasi UI/frontend penuh. Kiandra tetap memegang setup awal, semua backend, integrasi backend ke frontend, dan deployment Vercel.
