# PLAN-Menfess-Spenthree

**Nama proyek:** Menfess Spenthree  
**Jenis dokumen:** Rencana pengembangan proyek  
**Status:** Draft kerja untuk disepakati tim  
**Versi:** 1.0  
**Tanggal penyusunan:** 21 Oktober 2026  
**Repository:** https://github.com/KiandrAHD/Menfess-Spenthree  
**Dokumen terkait:** `ARSITEKTUR_MENFESS_SPENTHREE.md` dan `PRD-Menfess-Spenthree.md`

---

## 1. Ringkasan proyek

Menfess Spenthree adalah website menfess anonim untuk warga SMP Negeri 3 Sokaraja. Pengguna dapat menulis pesan melalui website tanpa membuat akun atau menampilkan nama pengirim. Setelah pesan dikirim, sistem menjalankan validasi otomatis dan menerbitkan pesan yang lolos validasi ke akun Instagram Menfess Spenthree. Teks pesan akan dibuat menjadi gambar menggunakan template visual yang konsisten, lalu dipublikasikan melalui Instagram Platform API.

Website dirancang mengikuti acuan UI/UX pada Figma dan screenshot yang sudah disediakan. Halaman utama meliputi Beranda, Tulis Menfess, Periksa Pesan, Status Pesan, Detail Menfess, dan Panduan.

**Keputusan produk utama:** tidak ada login pengguna, tidak ada panel admin, tidak ada panel moderator, dan tidak ada persetujuan manual sebelum posting. Validasi otomatis, pengendalian spam, pengelolaan antrean, serta pencatatan status tetap berjalan di backend. Fitur tanggapan OSIS tidak masuk MVP karena tidak tersedia alur staf di website.

> Publikasi otomatis berarti tidak ada persetujuan manusia per pesan. Filter otomatis tidak dapat menjamin semua konten berbahaya terdeteksi. Karena itu, sistem harus menjelaskan bahwa pesan dapat menjadi publik, menolak pola pelanggaran yang dapat dikenali, menerapkan pembatasan spam, dan menyediakan panduan/pelaporan yang jelas.

## 2. Tujuan proyek

1. Menyediakan tempat bagi warga Spenthree untuk menyampaikan pesan secara anonim melalui antarmuka mobile-first.
2. Mengotomatisasi proses perubahan teks menfess menjadi gambar dan publikasi ke Instagram tanpa unggah manual.
3. Menyediakan kode pelacakan agar pengirim bisa mengecek apakah pesan masih diproses, berhasil terbit, atau mengalami kendala.
4. Menampilkan pada website hanya pesan yang telah berhasil dipublikasikan, dengan desain yang konsisten dengan Figma.
5. Menjaga keamanan kredensial Instagram, data operasional, dan akses database tanpa menambah panel staf pada produk.
6. Menghasilkan codebase yang mudah dipelihara, diuji, dan dikembangkan bersama melalui GitHub.

## 3. Batasan dan keputusan yang sudah ditetapkan

- **Frontend:** React JS + Vite.
- **Database dan backend:** Supabase PostgreSQL dan Supabase Edge Functions.
- **Publikasi sosial:** Instagram Platform API, setelah akun tujuan, izin, token, dan metode autentikasi diverifikasi.
- **Hosting frontend:** Vercel atau hosting statis setara.
- **Akses pengguna:** anonim; tidak membutuhkan registrasi atau login.
- **Alur publikasi:** kirim → validasi otomatis → antrean → render gambar → Instagram API → update status.
- **Tidak ada panel admin/moderator:** akses operasional ke dashboard Supabase/Meta adalah akses infrastruktur pemilik proyek, bukan fitur pada website.
- **Tidak ada persetujuan manual:** pesan yang lolos validasi otomatis dapat dipublikasikan.
- **Kategori awal:** Menfess, Aspirasi, Curhat, Apresiasi.
- **Batas isi awal:** 10–500 karakter, dapat disesuaikan setelah review dengan desain dan kebutuhan operasional.
- **Penerima:** opsional dan dibatasi panjangnya; nama penerima tetap merupakan teks dari pengguna dan tidak boleh menjadi tempat untuk menyebarkan data pribadi.
- **Tanggapan OSIS:** di luar MVP.
- **Teknologi tambahan:** React Router, Tailwind CSS atau CSS modular (pilih satu), Lucide React, GitHub, dan pengujian otomatis.

## 4. Ruang lingkup pekerjaan

### 4.1 Termasuk MVP

- Setup React + Vite, struktur direktori, routing, design tokens, dan komponen UI.
- Implementasi halaman Beranda, Tulis Menfess, Periksa Pesan, Status Pesan, Detail Menfess, dan Panduan.
- Form pengiriman anonim tanpa autentikasi pengguna.
- Validasi frontend untuk kenyamanan dan validasi server sebagai otoritas.
- Persetujuan eksplisit sebelum kirim yang menjelaskan bahwa pesan dapat dipublikasikan secara publik ke Instagram dan website.
- Pembuatan kode pelacakan acak yang kuat; kode mentah hanya ditampilkan setelah pengiriman berhasil dan disimpan dalam bentuk hash/HMAC di server.
- Database schema dan migrasi Supabase.
- Endpoint publikasi dan pelacakan yang membatasi data yang dikembalikan.
- Anti-spam, pembatasan rate, pencegahan klik ganda, serta validasi aturan konten otomatis.
- Template gambar Instagram dari teks menfess.
- Penyimpanan aset gambar publikasi dengan lifecycle yang jelas.
- Antrean/job publikasi, pemrosesan ulang yang aman, dan pencatatan status/error terbatas.
- Publikasi otomatis melalui Instagram API.
- Feed yang hanya menampilkan pesan berstatus `published`.
- Status publikasi, tautan Instagram bila tersedia, dan penanganan kegagalan.
- Fitur suka sesuai acuan desain jika kontrol penyalahgunaan memenuhi kriteria rilis.
- Panduan penggunaan, kebijakan privasi, aturan konten, dan instruksi pelaporan.
- Pengujian fungsional, responsivitas, akses data, kegagalan API, dan keamanan dasar.
- Deployment staging dan produksi.

### 4.2 Tidak termasuk MVP

- Login atau pendaftaran akun untuk pengirim.
- Panel admin dan panel moderator pada website.
- Persetujuan manusia sebelum publikasi.
- Membuat tanggapan OSIS dari website.
- Komentar pengguna, pesan pribadi, upload gambar/video dari pengirim, dan notifikasi push.
- Menjamin filter otomatis dapat mendeteksi semua bentuk pelecehan, ancaman, informasi pribadi, atau bahasa ambigu.
- Menjanjikan waktu publikasi yang pasti karena proses bergantung pada respons dan batasan Instagram API.

## 5. Prinsip pelaksanaan

1. **Mobile-first:** layout harus nyaman di layar ponsel dan tetap rapi di desktop.
2. **Anonimitas:** jangan meminta nama, email, nomor telepon, atau akun media sosial untuk menulis menfess.
3. **Transparansi:** pengguna diberi tahu sebelum mengirim bahwa pesan yang lolos validasi akan dipublikasikan secara publik.
4. **Server sebagai sumber kebenaran:** status, validasi, kode pelacakan, dan publikasi ditentukan di backend, bukan dari nilai yang dikirim frontend.
5. **Fail closed untuk publikasi:** jika validasi atau pemeriksaan wajib gagal, jangan lanjutkan publikasi.
6. **Idempotensi:** request yang diulang tidak boleh menghasilkan beberapa pesan atau postingan yang sama.
7. **Perubahan bertahap:** pekerjaan masuk melalui branch dan pull request; `main` harus tetap stabil.
8. **Keamanan sejak awal:** RLS, SQL grants, rate limiting, dan penyimpanan secrets masuk pada fase fondasi, bukan setelah semua halaman selesai.
9. **Tidak ada data sensitif dalam log:** log menyimpan kode error/metadata minimum, bukan token, kode pelacakan mentah, atau isi pesan penuh tanpa kebutuhan.

## 6. Struktur tim dan tanggung jawab

Jumlah dan nama anggota tim belum ditetapkan di dokumen ini. Gunakan peran berikut dan isi nama penanggung jawab ketika briefing tim.

| Peran | Tanggung jawab utama | Hasil yang harus diserahkan |
|---|---|---|
| Project Lead / Integrator | Memelihara scope, keputusan teknis, routing/layout bersama, review PR, integrasi, rilis | Backlog, keputusan terdokumentasi, integrasi stabil, release checklist |
| Frontend Developer | Menerjemahkan Figma ke React, form, feed, navigasi, status, responsivitas, state UI | Halaman berfungsi, komponen bersama, tes UI yang relevan |
| Backend / Supabase Developer | Schema/migrasi, Edge Functions, RLS, tracking, antrean, idempotensi | Migrasi, kontrak endpoint, policy dan tes akses |
| Instagram Integration Owner | Setup Meta Developer, izin/token, renderer, publikasi, retry dan diagnosa | Spike API, template gambar, worker publikasi, runbook kegagalan |
| QA / Dokumentasi (dapat dirangkap) | Skenario tes, regresi, uji keamanan dasar, panduan dan catatan rilis | Checklist QA, bug report, dokumentasi pembaruan |

Satu anggota boleh memegang lebih dari satu peran, tetapi setiap issue harus memiliki satu pemilik utama. Untuk tim tiga orang, tanggung jawab Instagram Integration dapat digabung dengan Backend/Supabase.

## 7. Alur kerja Git dan code review

### 7.1 Aturan branch

- `main`: versi stabil yang bisa dibangun dan diuji.
- `feature/nama-fitur`: fitur baru.
- `fix/nama-bug`: perbaikan bug.
- `docs/nama-dokumen`: dokumentasi.
- `test/nama-pengujian`: penambahan atau perbaikan tes.

Contoh:

```text
feature/home-feed
feature/menfess-form
feature/tracking-status
feature/instagram-publisher
feature/image-template
fix/duplicate-publication
fix/tracking-code-validation
docs/prd
```

### 7.2 Format commit

```text
feat: add anonymous menfess form
feat: add Instagram publication queue
fix: prevent duplicate publish jobs
fix: restrict public feed to published messages
style: align feed with Figma
test: cover tracking status endpoint
docs: add project plan and PRD
```

Hilangkan spasi awal pada subject commit; contoh `test: cover tracking status endpoint` merupakan format yang benar.

### 7.3 Siklus pull request

1. Ambil perubahan terbaru dari `main`.
2. Buat branch khusus untuk satu isu atau kelompok perubahan kecil.
3. Implementasikan dan uji secara lokal.
4. Perbarui dokumentasi jika kontrak endpoint/schema berubah.
5. Buka pull request yang menjelaskan tujuan, perubahan, cara menguji, screenshot UI (jika relevan), dan risiko.
6. Minta minimal satu anggota tim melakukan review.
7. Pastikan build dan tes yang tersedia lolos.
8. Perbaiki komentar review sebelum merge.
9. Hapus branch setelah merge bila tidak lagi diperlukan.

Jangan menaruh kredensial nyata atau data kiriman pengguna pada issue, commit, screenshot, maupun log CI.

## 8. Roadmap dan milestone

Estimasi tiga minggu berikut adalah patokan perencanaan awal, bukan deadline yang sudah disepakati. Durasi perlu diperbarui setelah akses Instagram API, jumlah anggota, dan waktu yang tersedia dikonfirmasi.

### Fase 0 — Validasi kelayakan integrasi

**Estimasi:** 1–3 hari kerja.

Pekerjaan:
- Konfirmasi akun Instagram tujuan merupakan akun profesional yang sesuai.
- Buat/konfigurasi aplikasi Meta Developer dan tinjau metode autentikasi serta izin publikasi yang berlaku.
- Pastikan token dapat dibuat, disimpan sebagai secret, dan dipakai di lingkungan uji.
- Buat satu gambar JPEG contoh dari template menfess.
- Uji container, status container, dan publikasi pada akun uji atau akun tujuan yang disetujui.
- Catat rate limit, expiry token, kebutuhan akses URL media, dan error yang ditemui.

**Kriteria lolos:** satu posting percobaan berhasil melalui API; media ID dikembalikan dan prosedur autentikasi dapat diulang. Jika gagal, jangan membangun keseluruhan pipeline berdasarkan asumsi; selesaikan blocker akses terlebih dahulu.

### Fase 1 — Fondasi aplikasi

**Estimasi:** 2–4 hari kerja.

Pekerjaan:
- Setup Vite, React, routing dan linting.
- Tentukan styling utama serta font, warna, spacing, radius, dan komponen bersama berdasarkan Figma.
- Buat halaman dengan data dummy untuk memisahkan pekerjaan visual dari integrasi backend.
- Siapkan Supabase project, CLI, konfigurasi lokal, migrasi awal, dan `.env.example`.
- Sepakati kontrak schema, kategori, status, endpoint, dan bentuk error.

**Kriteria lolos:** aplikasi berjalan secara lokal, halaman utama dapat dinavigasi, migrasi dapat diterapkan, dan tidak ada secret di repository.

### Fase 2 — Database dan submit anonim

**Estimasi:** 3–4 hari kerja.

Pekerjaan:
- Buat tabel `messages`, `publication_jobs` (atau gunakan Supabase Queues sesuai spike), dan `message_likes` bila masuk rilis.
- Rancang status, tracking code, idempotency, retensi, dan indeks.
- Buat fungsi submit dengan validasi server, rate limit, persetujuan pengguna, anti-spam, dan penanganan input tidak valid.
- Simpan kode tracking sebagai hash/HMAC; kode mentah hanya dikembalikan satu kali ke pengirim.
- Terapkan RLS dan grants minimum; tutup akses langsung yang tidak diperlukan.

**Kriteria lolos:** payload valid menghasilkan satu pesan dan satu job; payload invalid ditolak; klik ganda tidak membuat duplikasi; data internal tak dapat dibaca melalui akses publik langsung.

### Fase 3 — UI dan pelacakan

**Estimasi:** 3–4 hari kerja; dapat berjalan paralel setelah kontrak data disetujui.

Pekerjaan:
- Implementasikan Beranda, filter kategori, kartu menfess, halaman Tulis, Periksa, Status, Detail, dan Panduan.
- Buat state loading, empty, error, berhasil, `queued`, dan status lain yang akan ditampilkan.
- Integrasikan feed publik yang hanya mengembalikan pesan `published`.
- Integrasikan endpoint tracking tanpa mengirim kode lewat query string/URL.
- Buat teks panduan, aturan konten, dan persetujuan sebelum submit.

**Kriteria lolos:** seluruh alur pengirim berjalan pada viewport mobile dan desktop; status ditampilkan dari backend; belum ada pesan non-published yang muncul di feed.

### Fase 4 — Renderer dan publikasi Instagram

**Estimasi:** 3–5 hari kerja, tergantung API dan implementasi rendering.

Pekerjaan:
- Tentukan metode renderer yang kompatibel dengan runtime terpilih.
- Buat gambar menfess dengan ukuran, rasio, font, contrast, wrapping, dan fallback yang sudah diuji.
- Simpan hasil gambar ke lokasi yang bisa diambil Instagram tanpa mengekspos konten yang belum disetujui aturan otomatis.
- Buat worker yang mengklaim satu job secara atomik, memanggil API, memeriksa status container, publish, dan merekam ID/permalink.
- Terapkan retry dengan backoff, batas percobaan, timeout dan rekonsiliasi untuk hasil API yang ambigu.
- Pastikan postingan berhasil tidak dapat terbit dua kali karena retry.

**Kriteria lolos:** satu pesan yang lolos validasi diterbitkan ke Instagram dan status database berubah menjadi `published`; kegagalan API tercatat tanpa membocorkan token.

### Fase 5 — QA, keamanan, dan rilis

**Estimasi:** 2–4 hari kerja.

Pekerjaan:
- Uji alur pengiriman hingga Instagram.
- Uji tracking code salah, input terlalu panjang, kategori tidak valid, spam, klik ganda, timeout, token kedaluwarsa, dan URL media gagal.
- Uji RLS/grants dengan role publik dan akses browser langsung.
- Uji responsivitas dengan perangkat/viewport berbeda.
- Periksa bundle frontend dan repository untuk secret.
- Deploy staging, lakukan acceptance test, lalu rilis produksi setelah pemilik proyek mengonfirmasi akun/API siap.
- Dokumentasikan pengoperasian token, rotasi secret, pemantauan, penghapusan konten, dan pemulihan job gagal.

**Kriteria lolos:** acceptance criteria inti dan security checklist berhasil; tidak ada bug kritis atau kebocoran kredensial yang diketahui; kebijakan privasi dan aturan sudah tersedia.

## 9. Backlog implementasi

| ID | Pekerjaan | Prioritas | Ketergantungan |
|---|---|---|---|
| MFS-001 | Setup React, Vite, routing, linting dan struktur folder | P0 | Tidak ada |
| MFS-002 | Design tokens dan komponen UI dari Figma | P0 | MFS-001 |
| MFS-003 | Validasi akun/izin Instagram dan posting percobaan | P0 | Akses akun Meta |
| MFS-004 | Migrasi `messages` dan status publikasi | P0 | MFS-001 |
| MFS-005 | RLS, grants, tracking hash, indeks, dan retensi | P0 | MFS-004 |
| MFS-006 | Endpoint submit anonim dengan validasi server | P0 | MFS-004, MFS-005 |
| MFS-007 | Idempotensi dan rate limiting/anti-spam | P0 | MFS-006 |
| MFS-008 | Beranda dan filter kategori | P0 | MFS-002, kontrak feed |
| MFS-009 | Form Tulis dan halaman Periksa | P0 | MFS-002, MFS-006 |
| MFS-010 | Endpoint feed publik dan detail published | P0 | MFS-004, MFS-005 |
| MFS-011 | Kode pelacakan dan halaman Status | P0 | MFS-006 |
| MFS-012 | Generator gambar JPEG dari template | P0 | MFS-003 |
| MFS-013 | Penyimpanan media dan worker antrean | P0 | MFS-004, MFS-012 |
| MFS-014 | Integrasi Instagram container/publish | P0 | MFS-003, MFS-013 |
| MFS-015 | Retry aman dan deteksi potensi duplikasi | P0 | MFS-014 |
| MFS-016 | Panduan dan kebijakan privasi | P0 | Aturan produk disepakati |
| MFS-017 | Suka pada menfess | P1 | MFS-010, desain anti-abuse |
| MFS-018 | QA functional, security, dan E2E | P0 | Semua jalur utama |
| MFS-019 | Deployment staging dan produksi | P0 | MFS-018 |
| MFS-020 | README dan runbook operasional | P0 | Setup/runtime diputuskan |

## 10. Pengujian dan QA

### 10.1 Pengujian fungsional

- Pengguna membuka Beranda dan melihat hanya menfess terbit.
- Filter kategori dan urutan terbaru bekerja sesuai desain.
- Isi 10–500 karakter yang valid dapat dikirim setelah persetujuan aturan dicentang.
- Pesan kosong, terlalu pendek, terlalu panjang, atau kategori tidak dikenal ditolak.
- Permintaan submit yang dikirim dua kali tidak membuat dua job.
- Kode pelacakan valid menunjukkan status sesuai backend; kode salah tidak membocorkan konten.
- Jika publikasi sukses, Instagram media ID disimpan dan feed menampilkan pesan.
- Jika publikasi gagal, status dan pesan pengguna tetap jelas tanpa memperlihatkan error internal.
- Fitur suka, jika disertakan, tidak menggandakan suka dari token browser yang sama sesuai desain implementasi.

### 10.2 Pengujian keamanan

- Tidak ada secret Meta/Instagram atau Supabase service-role di frontend, source map publik, atau Git.
- Browser anonim tidak dapat membaca tabel pesan/job secara langsung melalui REST/PostgREST.
- Browser tidak dapat memodifikasi status, hash tracking, media ID, atau kolom internal.
- Rate limit berjalan pada request berulang dan burst yang melebihi batas.
- Isi pesan tidak masuk ke log teknis secara penuh tanpa alasan operasional.
- Kode tracking tidak muncul pada query string, referer, atau log browser yang tidak diperlukan.
- Hasil renderer meng-escape teks sehingga isi pengguna tidak bisa menyuntikkan HTML atau merusak layout.
- Endpoint status, feed, dan detail hanya mengeluarkan properti yang diizinkan.

### 10.3 Pengujian integrasi Instagram

- Token valid dan izin yang diperlukan dapat membuat media container.
- URL gambar dapat diakses oleh Instagram selama proses ingest.
- Status container diperiksa sebelum publish.
- Respons publish sukses disimpan dalam database.
- Token expired, izin kurang, limit, timeout, URL tidak tersedia dan error 5xx ditangani dengan tepat.
- Hasil timeout yang ambigu direkonsiliasi sebelum percobaan ulang agar tidak membuat posting ganda.

## 11. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Akses publik Instagram API belum siap | Fitur inti tidak bisa diluncurkan | Uji autentikasi, izin, dan posting percobaan pada Fase 0 sebelum investasi penuh |
| Filter otomatis gagal menemukan konten berbahaya | Pesan merugikan dapat terbit | Aturan jelas, pemeriksaan pola, limit, challenge, jalur laporan, prosedur penghapusan; jangan menyatakan filter sempurna |
| Spam/bot membanjiri submit | Biaya, antrean menumpuk, feed buruk | Rate limit, idempotency, Turnstile/challenge jika perlu, batas antrean dan monitoring |
| Token Instagram kedaluwarsa/dicabut | Publikasi berhenti | Status error terkontrol, alert pemilik, prosedur re-autentikasi dan rotasi secret |
| API timeout setelah publish | Duplikasi ketika retry | Rekonsiliasi status dan media ID sebelum mencoba ulang |
| Gambar gagal dibuat atau URL tidak bisa diakses | Pesan tertahan | Validasi gambar, retry terbatas, pemeriksaan URL dari lingkungan eksternal |
| Akses database terbuka | Data internal bocor | RLS/grants minimum, endpoint terpilih, uji akses negatif sebelum rilis |
| Konflik antaranggota | Integrasi tertunda | Kontrak data, pemilik issue, branch, PR, review, dan update rutin |
| Perubahan kebijakan/versi Meta | Publikasi rusak | Catat versi API, baca dokumentasi resmi saat implementasi, uji staging berkala |

## 12. Definition of Done

Sebuah issue dianggap selesai apabila:

- Tujuan issue dan acceptance criteria terpenuhi.
- Implementasi mengikuti keputusan arsitektur dan desain yang telah disepakati.
- Tidak ada kredensial atau data pribadi yang ditambahkan ke Git.
- Error/loading/empty state dibuat untuk alur yang relevan.
- Tes terkait lulus atau langkah pengujian manual terdokumentasi.
- Perubahan schema/API diikuti pembaruan dokumentasi.
- Pull request ditinjau minimal satu anggota lain dan tidak memiliki konflik.
- Tidak merusak alur lain; build aplikasi masih berhasil.

Rilis keseluruhan belum dianggap selesai sebelum pipeline Instagram diuji pada akun yang memang akan digunakan, kebijakan privasi dan aturan tayang tersedia, serta penanggung jawab operasional ditentukan.

## 13. Checklist rilis

- [ ] Akun Instagram tujuan dan pemiliknya terkonfirmasi.
- [ ] Alur autentikasi dan izin API sudah diuji sesuai dokumentasi Meta terbaru.
- [ ] Satu posting percobaan berhasil.
- [ ] Semua secrets dikonfigurasi pada environment server dan tidak berada di Git.
- [ ] Migrasi produksi diperiksa dan backup/pemulihan data dipahami.
- [ ] RLS dan grants diuji dengan akses anonim.
- [ ] Rate limit dan anti-spam aktif.
- [ ] Form menjelaskan bahwa menfess yang lolos validasi akan dipublikasikan secara publik.
- [ ] Status tracking dan penanganan `failed`/`retry_scheduled` berfungsi.
- [ ] Feed hanya menampilkan status `published`.
- [ ] Retry tidak menimbulkan posting duplikat.
- [ ] Panduan, aturan konten, kebijakan privasi, dan jalur laporan tersedia.
- [ ] Uji mobile dan desktop selesai.
- [ ] Runbook token, pemantauan, penghapusan konten, dan pemulihan job tersedia.

## 14. Dokumentasi yang terkait

- `ARSITEKTUR_MENFESS_SPENTHREE.md` — komponen sistem, alur, database, API dan keamanan.
- `PRD-Menfess-Spenthree.md` — kebutuhan produk, user story, requirement dan acceptance criteria.
- `README.md` — cara setup, variabel lingkungan, menjalankan aplikasi, dan proses deployment.
- `supabase/migrations/` — skema database yang menjadi sumber kebenaran untuk perubahan struktur.

## 15. Referensi teknis

- Meta Instagram Platform: https://developers.facebook.com/docs/instagram-platform/
- Meta Content Publishing: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- Meta IG User Media reference: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Queues: https://supabase.com/docs/guides/queues
- Supabase Scheduling Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets

---

**Catatan pemeliharaan:** perbarui dokumen ini apabila ruang lingkup, anggota dan penanggung jawab, jadwal, status, endpoint, atau metode integrasi Instagram berubah. Keputusan baru harus dicatat dan disinkronkan dengan PRD serta dokumen arsitektur.
