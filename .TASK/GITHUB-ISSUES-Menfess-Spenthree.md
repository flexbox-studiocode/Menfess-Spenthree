# Backlog GitHub Issues — Menfess Spenthree

Repository: https://github.com/KiandrAHD/Menfess-Spenthree

> Catatan: Issue belum dibuat langsung melalui integrasi GitHub karena API mengembalikan `403 Resource not accessible by integration`. Bagian berikut siap disalin ke GitHub Issues. Assign hanya bisa berhasil jika akun GitHub anggota sudah menjadi collaborator dan username-nya benar.

## Issue 1 — [SETUP] Inisialisasi proyek React + Vite dan fondasi repository
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `setup`, `documentation`

### Tujuan
Menyiapkan fondasi proyek yang akan dipakai bersama oleh frontend dan backend.

### Checklist
- [ ] Inisialisasi React JS + Vite.
- [ ] Tetapkan satu styling system (Tailwind CSS atau CSS modular).
- [ ] Pasang React Router, Lucide React, dan dependensi dasar yang disepakati.
- [ ] Siapkan scripts dev/build/lint/test.
- [ ] Buat `.gitignore`, `.env.example`, dan README setup lokal.
- [ ] Tetapkan branch dan aturan PR.
- [ ] Sepakati kontrak awal frontend–backend: kategori, status, endpoint, payload, response, dan error shape.
- [ ] Jangan menyimpan secrets di Git atau variabel `VITE_*` yang bersifat rahasia.

### Kriteria selesai
- [ ] Anggota tim dapat menjalankan proyek dari README.
- [ ] Build berhasil.
- [ ] Kontrak integrasi terdokumentasi.
- [ ] Repository tidak memuat secret.

### Dependensi
Tidak ada. Task ini menjadi fondasi kerja frontend dan backend.

---

## Issue 2 — [FRONTEND] Implementasi seluruh UI berdasarkan Figma
**Assignee:** Reiner  
**Labels yang disarankan:** `frontend`, `design`, `ui`

### Tujuan
Menyelesaikan seluruh antarmuka pengguna Menfess Spenthree sesuai Figma dan PRD, menggunakan mock service bila endpoint backend belum siap.

### Checklist
- [ ] Setup design tokens dan komponen reusable sesuai styling system yang dipilih Kiandra.
- [ ] Implementasikan layout dan navigasi mobile-first.
- [ ] Implementasikan Beranda, feed, filter kategori, dan detail menfess.
- [ ] Implementasikan form Tulis Menfess dengan kategori, penerima opsional, batas karakter, checkbox persetujuan dan feedback validasi.
- [ ] Implementasikan halaman Periksa/Preview yang digunakan oleh pengirim sendiri, bukan panel moderator.
- [ ] Implementasikan tampilan hasil pengiriman dan kode tracking dari response backend.
- [ ] Implementasikan halaman Status dengan semua status publikasi dari kontrak API.
- [ ] Implementasikan Panduan dan informasi privasi/aturan.
- [ ] Buat loading, empty, error, success, not-found dan retry states.
- [ ] Pastikan semua halaman responsif untuk HP dan desktop.
- [ ] Pisahkan mock service dari komponen, agar Kiandra dapat menghubungkan API tanpa mengubah UI besar-besaran.
- [ ] Tidak membuat login pengguna, panel admin, panel moderator, atau UI tanggapan OSIS di MVP.
- [ ] Jangan akses tabel Supabase internal langsung dan jangan menaruh secret/token di browser.

### Kriteria selesai
- [ ] Tampilan inti cocok dengan Figma.
- [ ] Navigasi dan seluruh alur UI berfungsi dengan mock contract.
- [ ] Build frontend berhasil.
- [ ] Tidak ada panel admin/moderator atau login pengirim.
- [ ] PR berisi cara uji dan screenshot bila ada perubahan visual besar.

### Dependensi
Issue setup awal dan kontrak frontend-backend.

---

## Issue 3 — [BACKEND] Schema Supabase, migration, RLS, dan grants
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `backend`, `database`, `security`

### Checklist
- [ ] Buat migrasi tabel `messages`, `publication_jobs`/outbox dan `message_likes` jika fitur suka masuk scope.
- [ ] Tetapkan kategori dan status sesuai PRD.
- [ ] Simpan tracking code dalam bentuk hash/HMAC.
- [ ] Tambahkan request ID/idempotency, indeks, timestamps dan metadata publikasi.
- [ ] Terapkan RLS serta SQL grants minimum.
- [ ] Tutup akses publik langsung ke tabel internal.
- [ ] Tentukan retensi pesan, job dan aset.
- [ ] Tambahkan tes akses pengguna anonim.

### Kriteria selesai
Migrasi berjalan pada database dev bersih, feed hanya memuat `published`, dan pengguna anonim tidak dapat mengubah status atau metadata internal.

---

## Issue 4 — [BACKEND] Endpoint submit anonim, validasi, anti-spam, dan tracking
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `backend`, `security`, `api`

### Checklist
- [ ] Buat Edge Function `submit-menfess`.
- [ ] Validasi kategori, isi, penerima opsional, ukuran payload, persetujuan, dan aturan konten.
- [ ] Implementasikan rate limit/anti-spam.
- [ ] Terapkan idempotensi untuk mencegah double-submit.
- [ ] Generate tracking code acak; simpan hash/HMAC, kirim kode mentah hanya sekali.
- [ ] Simpan pesan dan publication job secara konsisten.
- [ ] Kembalikan acknowledgement cepat setelah data dan job tersimpan.
- [ ] Buat endpoint tracking dengan POST body.
- [ ] Gunakan error response publik yang tidak membocorkan detail internal.

### Kriteria selesai
Payload valid menghasilkan satu pesan dan satu job; payload invalid ditolak; tracking tidak membocorkan pesan lain; retry tidak membuat submission duplikat.

---

## Issue 5 — [BACKEND] Feed publik, filter kategori, dan detail menfess
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `backend`, `api`

### Checklist
- [ ] Buat endpoint feed dengan pagination/cursor.
- [ ] Tambahkan filter kategori allowlist.
- [ ] Buat endpoint detail untuk menfess yang sudah published.
- [ ] Kembalikan hanya kolom publik.
- [ ] Jangan mengembalikan pesan non-published.
- [ ] Dokumentasikan request/response JSON untuk Reiner.
- [ ] Uji cursor invalid, kategori invalid, empty state, dan error database.

### Kriteria selesai
API mempunyai kontrak stabil dan aman untuk dipakai frontend.

---

## Issue 6 — [BACKEND] Renderer gambar dan publikasi Instagram otomatis
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `backend`, `instagram`, `integration`

### Checklist
- [ ] Verifikasi tipe akun Instagram, akses Meta Developer, token dan izin publish.
- [ ] Lakukan smoke test satu posting uji.
- [ ] Pilih renderer yang sesuai runtime.
- [ ] Buat gambar JPEG dari template Menfess Spenthree.
- [ ] Simpan gambar pada URL yang dapat diakses Instagram saat ingest.
- [ ] Buat worker yang mengklaim publication job secara atomik.
- [ ] Buat container, periksa status, lalu publish melalui Instagram API.
- [ ] Simpan media ID, permalink jika tersedia dan waktu publikasi.
- [ ] Terapkan retry terbatas dengan backoff dan rekonsiliasi untuk timeout ambigu.
- [ ] Simpan token hanya pada server secret.

### Kriteria selesai
Satu pesan tes terpublikasi dengan sukses melalui API; status published hanya setelah konfirmasi; retry tidak menggandakan posting.

---

## Issue 7 — [INTEGRASI] Integrasi backend–frontend dan uji end-to-end
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `integration`, `testing`

### Checklist
- [ ] Review frontend Reiner sesuai kontrak API.
- [ ] Hubungkan service layer dengan endpoint submit, tracking, feed dan detail.
- [ ] Hapus mock data dari jalur produksi.
- [ ] Hubungkan seluruh loading/error/empty/success state.
- [ ] Terapkan polling status terbatas dengan backoff.
- [ ] Uji alur submit → queued/processing → Instagram → published → feed.
- [ ] Uji timeout, gagal jaringan, respons tidak valid dan retry.
- [ ] Pastikan tidak ada post duplikat.

### Kriteria selesai
Alur end-to-end berfungsi di staging dengan status berasal dari backend.

---

## Issue 8 — [DEPLOYMENT] Hosting Vercel dan rilis production
**Assignee:** `KiandrAHD`  
**Labels yang disarankan:** `deployment`, `release`, `security`

### Checklist
- [ ] Hubungkan repo ke Vercel.
- [ ] Konfigurasi build/output dan SPA rewrite jika dibutuhkan.
- [ ] Pisahkan environment staging dan production.
- [ ] Frontend hanya menerima Supabase URL dan publishable key.
- [ ] Simpan service-role dan Instagram token hanya sebagai secrets server-side.
- [ ] Terapkan migrasi production dengan prosedur terkendali.
- [ ] Uji CORS/domain dan seluruh route melalui refresh.
- [ ] Jalankan smoke test browser dan uji posting Instagram di environment yang tepat.
- [ ] Dokumentasikan rollback dan rotasi token.

### Kriteria selesai
Deploy berhasil, route tidak 404 saat refresh, tidak ada secret di browser, dan smoke test lulus.

---

## Issue 9 — [QA] Keamanan, privasi, responsivitas, dan release gate
**Assignee:** `KiandrAHD` (koordinasi), Reiner memperbaiki temuan UI  
**Labels yang disarankan:** `qa`, `security`, `testing`

### Checklist
- [ ] Uji input invalid, batas panjang, spam, double-submit, dan kode tracking invalid.
- [ ] Uji akses langsung ke tabel Supabase dan RLS/grants.
- [ ] Uji status non-published tidak tampil di feed/detail.
- [ ] Uji token expired, permission kurang, rate limit, media URL gagal dan timeout Instagram.
- [ ] Verifikasi retry tidak menghasilkan post duplikat.
- [ ] Pastikan tidak ada secret di Git, bundle, source map atau log.
- [ ] Uji layout HP dan desktop.
- [ ] Pastikan Panduan dan Kebijakan Privasi menjelaskan publikasi otomatis dan batas anonimitas.
- [ ] Catat temuan dan tetapkan keputusan siap rilis.

### Kriteria selesai
Semua jalur kritis lulus, tidak ada masalah keamanan kritis yang diketahui, dan checklist rilis terdokumentasi.
