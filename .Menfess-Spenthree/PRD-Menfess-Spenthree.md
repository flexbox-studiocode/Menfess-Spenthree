# PRD-Menfess-Spenthree

**Product Requirements Document (PRD)**  
**Nama produk:** Menfess Spenthree  
**Versi:** 1.0  
**Status:** Draft kebutuhan produk untuk disepakati  
**Tanggal:** 21 Oktober 2026  
**Repository:** https://github.com/KiandrAHD/Menfess-Spenthree  
**Dokumen terkait:** `ARSITEKTUR_MENFESS_SPENTHREE.md` dan `PLAN-Menfess-Spenthree.md`

---

## 1. Ringkasan eksekutif

Menfess Spenthree adalah website menfess anonim yang memungkinkan warga SMP Negeri 3 Sokaraja menyampaikan pesan melalui website, kemudian menerbitkannya secara otomatis ke akun Instagram Menfess Spenthree apabila lolos validasi otomatis.

Pengguna tidak perlu membuat akun, login, atau mengisi identitas pribadi. Website menyediakan Beranda, Tulis Menfess, Periksa Pesan, Status Pesan, Detail Menfess, dan Panduan. Setelah pengguna mengirim pesan, backend memvalidasi input, menerapkan perlindungan spam dan aturan konten, menyimpan pesan beserta kode pelacakan, mengubah teks menjadi gambar, lalu menjalankan alur publikasi menggunakan Instagram Platform API. Setelah Instagram mengonfirmasi publikasi, status diperbarui dan pesan dapat ditampilkan di feed website.

**Tidak ada panel admin, tidak ada panel moderator, dan tidak ada persetujuan manual.** Pengelolaan kredensial, konfigurasi integrasi, dan penanganan insiden tetap dilakukan oleh pemilik teknis melalui dashboard penyedia layanan atau prosedur operasional di luar website. Hal tersebut bukan bagian dari UI produk.

## 2. Latar belakang dan masalah

Warga sekolah mungkin ingin membagikan cerita, apresiasi, curhat, menfess, dan aspirasi tanpa harus menyebutkan identitasnya. Proses publikasi manual ke Instagram dapat membuat pengelola harus menyalin pesan, membuat desain secara terpisah, dan memperbarui website secara manual.

Produk ini bertujuan menyederhanakan alur menjadi satu proses: pengguna menulis pesan di website, sistem menjalankan validasi otomatis, dan pesan yang lolos validasi diproses hingga diterbitkan ke Instagram. Website menjadi tempat pengiriman, pelacakan, dan melihat feed, sedangkan Instagram menjadi kanal publikasi eksternal.

## 3. Visi dan tujuan produk

### 3.1 Visi

Menyediakan sarana berbagi pesan anonim yang mudah digunakan, konsisten dengan identitas visual Spenthree, dan terhubung dengan publikasi Instagram otomatis.

### 3.2 Tujuan yang dapat diuji

1. Pengunjung dapat mengirim menfess tanpa registrasi atau login.
2. Pesan valid disimpan dan mendapatkan satu kode pelacakan.
3. Pesan yang lolos validasi diproses ke pipeline publikasi Instagram tanpa persetujuan manual.
4. Pesan baru hanya muncul di feed website setelah publikasi Instagram berhasil dikonfirmasi.
5. Sistem mencegah satu request normal atau retry yang sama membuat posting duplikat.
6. Pengunjung dapat memeriksa status dengan kode pelacakan tanpa bisa membaca data pesan lain.
7. Website mengikuti prinsip desain pada Figma dan nyaman digunakan lewat ponsel.
8. Kunci API dan data internal tidak diekspos ke browser publik.

### 3.3 Indikator keberhasilan awal

Target numerik berikut merupakan target kerja awal dan harus dikalibrasi setelah pengujian staging:

- 100% payload yang diterima server melewati validasi schema dan batas produk.
- 100% pesan yang tampil di feed memiliki status publikasi `published`.
- Tidak ada kredensial rahasia di bundle frontend atau repository.
- Tidak ada duplikasi pada skenario submit berulang dengan `request_id` yang sama.
- Semua skenario kritis di tabel acceptance test lulus sebelum rilis.
- Untuk jaringan dan layanan normal, endpoint submit mengembalikan tanda terima dengan kode pelacakan secara cepat tanpa menunggu seluruh proses Instagram selesai. Target waktu teknis ditetapkan setelah baseline pengujian.
- Persentase keberhasilan publikasi dipantau pada staging/produksi; kegagalan permanen dan error autentikasi harus dapat dikenali pemilik teknis melalui log/alert eksternal.

Produk tidak boleh menjanjikan bahwa pesan selalu tayang dalam jumlah detik tertentu, karena hasil bergantung pada ketersediaan layanan dan keputusan API Instagram.

## 4. Pengguna dan pemangku kepentingan

### 4.1 Pengunjung/pengirim anonim

- Tidak memiliki akun di website.
- Menulis pesan, memilih kategori, dan bisa mengisi penerima opsional.
- Meninjau pratinjau sebelum mengirim.
- Menyetujui aturan dan penjelasan publikasi.
- Menerima kode pelacakan dan memeriksa statusnya.

### 4.2 Pembaca feed

- Membuka website tanpa login.
- Melihat menfess yang sudah diterbitkan.
- Menyaring kategori, membaca detail, melihat waktu, menyukai jika fitur suka tersedia, dan membuka tautan Instagram jika tersedia.

### 4.3 Pemilik teknis sistem

Pemilik teknis bukan role pengguna website dan tidak mendapat panel khusus pada MVP. Ia mengelola kredensial Meta/Instagram, konfigurasi Supabase, deployment, log operasional, rotasi token, serta penanganan kegagalan melalui alat infrastruktur yang sesuai.

## 5. Prinsip dan keputusan produk

- **Anonim pada pengalaman pengguna:** form tidak meminta nama atau akun, dan identitas pengirim tidak ditampilkan.
- **Publikasi otomatis:** tidak ada antrean persetujuan manusia di website.
- **Transparan sebelum pengiriman:** pengirim diberi tahu bahwa pesan yang lolos validasi akan dipublikasikan pada kanal publik Instagram dan feed website.
- **Validasi otomatis bukan moderasi sempurna:** sistem menolak aturan yang terdeteksi, tetapi tidak menjamin bisa memahami semua konteks bahasa.
- **Status di backend:** frontend tidak boleh menentukan sendiri bahwa pesan telah terbit.
- **Publikasi adalah proses asinkron:** pesan diterima lebih dulu, lalu status berlanjut sampai `published` atau status akhir lainnya.
- **Tidak ada tanggapan OSIS pada MVP:** fitur tanggapan dari desain awal ditunda karena website tidak memiliki panel staf atau mekanisme penerbitan tanggapan.
- **Tidak menerima media dari pengirim:** versi pertama hanya menerima teks agar risiko keamanan dan biaya lebih terkendali.

## 6. Ruang lingkup produk

### 6.1 Termasuk dalam MVP

1. Beranda feed menfess yang telah diterbitkan.
2. Filter kategori: Semua, Menfess, Aspirasi, Curhat, Apresiasi.
3. Formulir menulis menfess anonim.
4. Kolom penerima opsional.
5. Validasi isi dan persetujuan aturan.
6. Halaman pratinjau/Periksa Pesan.
7. Pengiriman anonim dengan kode pelacakan.
8. Status publikasi dan tautan Instagram ketika tersedia.
9. Generator gambar postingan menggunakan template merek.
10. Publikasi Instagram otomatis melalui API.
11. Detail menfess yang sudah dipublikasikan.
12. Panduan, aturan konten, privasi, dan arahan pelaporan.
13. Fitur suka sesuai rancangan awal apabila bisa diterapkan dengan kontrol abuse yang layak.
14. State loading, kosong, error, gagal, dan sukses.
15. Perlindungan spam, idempotensi, logging minimum dan retry publikasi.

### 6.2 Tidak termasuk MVP

- Login atau profil pengirim.
- Panel admin atau panel moderator pada website.
- Persetujuan manual sebelum publikasi.
- Tanggapan OSIS dari dalam website.
- Komentar publik, DM, follow, repost, unggah gambar/video pengirim, atau notifikasi push.
- Aplikasi mobile native.
- Moderasi manual di dalam aplikasi atau jaminan deteksi seluruh pesan yang berbahaya.
- Jaminan publikasi selalu berhasil jika Instagram/Meta API tidak tersedia, izin dicabut, atau limit tercapai.

## 7. Struktur halaman dan kebutuhan UI/UX

Desain merujuk pada file Figma Sagara dan screenshot yang disediakan untuk proyek Menfess Spenthree. Implementasi harus mengikuti bahasa visual yang terlihat: latar gelap biru-navy, aksen ungu, kartu gelap dengan border lembut, tipografi tegas, navigasi bawah, dan layout mobile-first.

### 7.1 Header dan navigasi

- Header menampilkan identitas/branding Spenthree dan identitas sekolah yang sudah diizinkan.
- Navigasi bawah mobile menampilkan Beranda, Tulis, Status, dan Panduan.
- Navigasi harus memperlihatkan halaman aktif dengan jelas.
- Pada desktop, layout menyesuaikan lebar layar tanpa membuat form terlalu melebar.
- Semua ikon memiliki label atau accessible name, dan kontrol dapat digunakan dengan keyboard.

### 7.2 Beranda

Elemen:
- Judul “Menfess Spenthree” dan deskripsi singkat.
- CTA utama “Tulis menfess”.
- Catatan bahwa pengirim tetap anonim dan pesan melewati validasi otomatis.
- Filter kategori serta pilihan urutan terbaru.
- Kartu menfess: avatar anonim generik, kode publik yang tidak bersifat rahasia (misalnya nomor urut publik), waktu publikasi, penerima opsional, kategori, isi, jumlah suka jika fitur tersedia, dan tautan ke detail.
- Loading skeleton, empty state, dan error state.

Aturan:
- Feed hanya memuat status `published`.
- Pesan tidak boleh di-render sebelum proses publikasi dikonfirmasi berhasil.
- Isi teks harus di-escape dan tidak boleh dieksekusi sebagai HTML.
- Jangan menampilkan kode pelacakan pribadi pada kartu atau URL publik.
- Gunakan pagination/cursor agar feed tidak mengambil semua pesan sekaligus.

### 7.3 Tulis menfess

Elemen:
- Dropdown kategori.
- Field “Untuk” yang opsional.
- Textarea isi pesan.
- Penghitung karakter dan petunjuk panjang minimum/maksimum.
- Penjelasan anonimitas.
- Checkbox wajib untuk menyetujui aturan dan memahami bahwa pesan yang lolos validasi akan dipublikasikan secara publik.
- Tombol “Periksa pesan”.

Validasi awal UI:
- Isi wajib diisi.
- Panjang awal yang ditetapkan adalah 10–500 karakter setelah aturan normalisasi disepakati.
- Kategori harus salah satu kategori resmi.
- Penerima opsional dan memiliki batas panjang.
- Tampilkan kesalahan dalam bahasa Indonesia yang jelas.

Validasi frontend hanya untuk UX. Semua nilai harus diverifikasi ulang pada server.

### 7.4 Periksa pesan

Halaman ini adalah pratinjau untuk pengirim sebelum mengirim, **bukan panel moderasi**. Halaman menampilkan kategori, penerima, isi pesan, keterangan anonim, serta pengingat bahwa submit dapat mengarah pada publikasi otomatis.

Aksi:
- “Kirim Menfess”: mengirim ke backend.
- “Ubah Pesan”: kembali ke form dengan isi sebelumnya.

Saat tombol diklik, cegah double submit. Setelah backend menerima data, tampilkan kode pelacakan satu kali dan beri instruksi untuk menyimpannya.

### 7.5 Status pesan

Elemen:
- Field kode pelacakan.
- Tombol “Periksa status”.
- Penjelasan bahwa kode diperlukan untuk memeriksa hasil pengiriman.
- Timeline status.
- Tautan “Baca di Instagram” jika publikasi berhasil dan permalink tersedia.

Status pengguna yang diperbolehkan:
- **Diterima:** pesan sudah disimpan dan menunggu proses.
- **Sedang diproses:** gambar atau media sedang disiapkan.
- **Sedang dipublikasikan:** permintaan publikasi sedang ditangani Instagram.
- **Berhasil dipublikasikan:** publikasi dikonfirmasi, tautan dapat dibuka bila tersedia.
- **Tidak dapat diproses:** validasi otomatis menolak pesan; jangan menampilkan aturan deteksi internal secara rinci.
- **Mengalami kendala:** publikasi gagal atau membutuhkan pemulihan; jangan membocorkan kode error, token, atau detail infrastruktur.

Status internal lebih rinci daripada status yang ditampilkan kepada pengguna. Kode tracking dikirim melalui request body, bukan query string. Respons tidak perlu mengembalikan isi pesan jika informasi status sudah cukup.

### 7.6 Detail menfess

- Hanya untuk pesan yang `published`.
- Menampilkan konten, kategori, waktu, penerima jika tersedia, hitungan suka, dan tautan posting Instagram.
- Tidak menampilkan identitas pengirim, data operasional, tracking code privat, atau error publikasi.
- Tampilkan empty/not-found state yang tidak membocorkan apakah sebuah ID internal atau pesan yang belum terbit benar-benar ada.

### 7.7 Panduan

Minimal memuat:
1. Tujuan layanan dan arti anonim.
2. Menulis dengan sopan dan tidak menyerang orang lain.
3. Larangan menyebarkan nomor telepon, alamat, akun pribadi, lokasi sensitif, atau data orang lain.
4. Larangan ancaman, pelecehan, perundungan, ujaran kebencian, spam, atau konten ilegal.
5. Penjelasan bahwa validasi otomatis dapat keliru dan tidak menjamin seluruh konten berbahaya tertangkap.
6. Penjelasan bahwa pesan yang lolos validasi otomatis dapat langsung dipublikasikan.
7. Cara menyimpan kode pelacakan.
8. Jalur pelaporan dan arahan untuk masalah keselamatan/sensitif melalui guru BK atau pihak sekolah yang ditunjuk.
9. Kebijakan privasi, retensi, dan kontak operasional yang ditentukan pemilik layanan.

## 8. Persyaratan fungsional

Label prioritas:
- **P0:** wajib untuk rilis MVP.
- **P1:** penting sesuai desain, namun dapat dipisahkan jika batas waktu sangat ketat.
- **P2:** pengembangan lanjutan.

### FR-01 — Feed publik (P0)

Sistem harus menampilkan daftar menfess yang sudah dipublikasikan.

Kriteria penerimaan:
- Hanya data dengan status `published` yang dikembalikan.
- Data memiliki waktu publikasi, kategori, dan isi yang diperlukan untuk kartu.
- Feed memiliki pagination/cursor.
- Tersedia loading, kosong, dan error state.
- Pesan baru belum tampil saat masih queued/processing/publishing.

### FR-02 — Filter kategori dan urutan (P0)

Pengunjung dapat memilih Semua, Menfess, Aspirasi, Curhat, dan Apresiasi serta urutan terbaru.

Kriteria penerimaan:
- Filter mengubah hasil tanpa refresh penuh yang tidak perlu.
- Parameter filter divalidasi oleh server.
- Kategori yang tidak diketahui ditolak atau dikembalikan ke filter default.
- Filter dan navigasi dapat digunakan pada mobile dan desktop.

### FR-03 — Form menfess anonim (P0)

Sistem memungkinkan pengunjung menulis pesan tanpa akun.

Kriteria penerimaan:
- Tidak meminta nama, email, nomor telepon, atau login.
- Kategori wajib dipilih; penerima opsional.
- Isi memiliki batas 10–500 karakter sebagai nilai awal produk.
- Form memiliki counter, pesan kesalahan yang jelas, dan tombol lanjut ke pratinjau.
- Server memvalidasi seluruh field tanpa mempercayai validasi browser.

### FR-04 — Pratinjau sebelum kirim (P0)

Pengirim dapat memeriksa konten sebelum submit.

Kriteria penerimaan:
- Kategori, penerima, dan isi ditampilkan sesuai form.
- Tombol ubah membawa pengguna kembali tanpa menghilangkan isi.
- Ada pernyataan jelas tentang publikasi otomatis ke kanal publik.
- Submit tidak bisa dilakukan tanpa persetujuan aturan yang wajib.

### FR-05 — Validasi, keamanan konten, dan anti-spam (P0)

Backend harus menolak input yang tidak sesuai dan membatasi penyalahgunaan endpoint anonim.

Kriteria penerimaan:
- Menolak isi kosong, kategori ilegal, teks di luar batas, payload besar, dan field yang tidak dikenal bila schema memakai strict mode.
- Menormalisasi input dengan aturan yang konsisten tanpa mengubah makna teks secara tidak perlu.
- Menerapkan rate limiting atau mekanisme anti-abuse yang terukur.
- Menggunakan aturan otomatis untuk pola yang dilarang, termasuk upaya penyebaran data pribadi, ancaman jelas, spam, dan pelecehan terdeteksi.
- Ketika pemeriksaan wajib gagal, pesan tidak masuk antrean publikasi.
- Pengguna hanya menerima alasan yang aman; pola deteksi, secret, dan stack trace tidak dikembalikan.
- Dokumen menyatakan filter otomatis tidak sempurna dan pesan yang lolos dapat langsung menjadi publik.

### FR-06 — Pembuatan tracking code (P0)

Setiap submit yang diterima menghasilkan kode pelacakan unik.

Kriteria penerimaan:
- Kode tidak berasal dari nomor urut database yang mudah ditebak.
- Entropi harus cukup tinggi; kode asli tidak disimpan secara plaintext, melainkan diverifikasi melalui hash/HMAC dengan secret server-side.
- Kode hanya dikembalikan saat submit berhasil dan tidak pernah ditampilkan pada feed publik.
- Request yang diulang dengan idempotency key yang sama tidak menghasilkan pesan atau job baru.
- Agar pengguna dapat memulihkan respons ketika koneksi putus setelah server menerima submit, simpan respons idempotensi dalam bentuk terenkripsi di penyimpanan backend yang hanya dapat diakses server dan hapus otomatis setelah masa retensi singkat (contoh awal: 24 jam). Tabel `messages` tetap hanya menyimpan hash/HMAC kode.
- Endpoint tracking membatasi percobaan dan tidak mengembalikan data jika kode tidak valid.

### FR-07 — Generator gambar Instagram (P0)

Sistem mengubah teks menfess menjadi satu gambar postingan.

Kriteria penerimaan:
- Template menggunakan identitas visual Menfess Spenthree.
- Isi teks di-wrap dan ditata agar tidak keluar dari batas gambar.
- Pesan dengan panjang maksimum tetap terbaca atau ditangani dengan aturan tampilan yang sudah ditetapkan.
- Renderer tidak memproses HTML/markup pengguna sebagai kode.
- File output berupa format/ukuran yang didukung Instagram API pada saat implementasi.
- Gambar dan URL-nya diuji sebelum dihubungkan ke pipeline produksi.

### FR-08 — Publikasi Instagram otomatis (P0)

Pesan yang lolos validasi otomatis diproses untuk dipublikasikan tanpa persetujuan manusia.

Kriteria penerimaan:
- Submit menghasilkan job publikasi durable/tercatat.
- Pekerjaan berjalan secara asinkron; pengguna tidak perlu menunggu request submit sampai selesai dipublikasikan.
- Server membuat media container, mengecek status kesiapan, lalu memanggil operasi publish berdasarkan dokumentasi Meta versi yang digunakan.
- Setelah sukses, database menyimpan media ID, waktu publikasi, dan permalink jika dapat diperoleh.
- Hanya status `published` yang tampil pada feed.
- Token tidak pernah dikirim ke browser atau dimasukkan ke log.
- Jika akun/permission belum siap, sistem tidak mengklaim fitur ini berhasil dan rilis publik ditahan sampai spike integrasi selesai.

### FR-09 — Status dan pemulihan publikasi (P0)

Sistem mencatat status internal dan memberikan status sederhana bagi pengirim.

Kriteria penerimaan:
- State machine dan transisi status tervalidasi.
- Retry menggunakan backoff dan batas percobaan.
- Worker mengklaim job secara atomik agar dua proses tidak menerbitkan pesan sama.
- Jika respons Instagram ambigu akibat timeout, sistem melakukan rekonsiliasi sebelum publish ulang.
- Error internal disimpan sebagai kode/error ringkas, tidak berisi token atau isi pesan penuh.
- Status terminal `failed` tetap dapat ditampilkan secara aman melalui tracking code.

### FR-10 — Halaman status (P0)

Pengirim dapat mengecek status berdasarkan kode pelacakan.

Kriteria penerimaan:
- Kode dikirim di body request, bukan URL/query string.
- Respons hanya mengeluarkan status dan metadata yang memang aman ditampilkan.
- Tidak ada hasil jika kode salah atau tidak valid.
- Status `published` menampilkan tautan Instagram bila tersedia.
- Error request diberi pesan dalam bahasa Indonesia.

### FR-11 — Detail menfess (P0)

Pembaca dapat membuka detail pesan yang sudah terbit.

Kriteria penerimaan:
- Hanya menfess berstatus `published` yang bisa dibuka.
- ID detail publik tidak mengekspos primary key atau tracking code privat bila tidak perlu.
- Tidak ditemukan/tidak publik ditangani dengan state aman.
- Konten di-escape agar aman dari XSS.

### FR-12 — Suka (P1)

Jika fitur suka tetap dipertahankan sesuai acuan UI, pengunjung dapat memberi suka pada menfess yang dipublikasikan.

Kriteria penerimaan:
- Hanya pesan `published` yang dapat disukai.
- Satu token pengunjung tidak dapat menambah suka yang sama berulang kali dalam kondisi normal.
- Server menghitung total; frontend tidak mengubah angka secara permanen sebelum server mengonfirmasi.
- Mekanisme dijelaskan sebagai mitigasi ringan, bukan identifikasi orang yang kuat, karena pengguna anonim dapat menghapus penyimpanan browser atau berganti perangkat.
- Jika perlindungan abuse tidak siap, fitur dapat dinonaktifkan tanpa merusak fitur utama.

### FR-13 — Panduan dan privasi (P0)

Website menyediakan panduan dan penjelasan privasi.

Kriteria penerimaan:
- Menjelaskan data apa yang diminta/tidak diminta, cara tracking code, publikasi otomatis, batas anonimitas, retensi, dan jalur pelaporan.
- Memuat larangan konten berbahaya dan dampak publikasi.
- Tidak mengklaim anonim absolut atau filter otomatis sempurna.
- Kebijakan disetujui oleh pemilik proyek/pihak sekolah yang bertanggung jawab sebelum rilis publik.

### FR-14 — Responsivitas dan aksesibilitas (P0)

Sistem dapat digunakan melalui ponsel dan desktop.

Kriteria penerimaan:
- Navigasi dan form dapat digunakan di lebar layar kecil.
- Teks memiliki kontras yang memadai, ukuran target sentuh nyaman, dan state fokus terlihat.
- Input memiliki label, error message terbaca, dan navigasi keyboard didukung.
- Konten tidak meluber saat pesan panjang atau ukuran font berubah.

## 9. Alur pengguna utama

### 9.1 Mengirim menfess

1. Pengunjung membuka Beranda.
2. Pengunjung memilih “Tulis menfess”.
3. Pengunjung memilih kategori, opsional menambahkan penerima, dan mengisi isi pesan.
4. Website memvalidasi field secara lokal dan menampilkan jumlah karakter.
5. Pengunjung lanjut ke halaman Periksa.
6. Pengunjung meninjau pesan, membaca keterangan publikasi, dan menyetujui aturan.
7. Pengunjung memilih “Kirim Menfess”.
8. Backend memvalidasi ulang, menerapkan kontrol anti-spam, membuat tracking code, menyimpan pesan, dan memasukkan job publikasi.
9. Website menampilkan konfirmasi dan kode pelacakan.
10. Worker membuat gambar dan menerbitkan ke Instagram.
11. Status berubah sesuai hasil API.
12. Setelah sukses, menfess tampil pada feed dan halaman status menyediakan tautan ke Instagram jika tersedia.

### 9.2 Mengecek status

1. Pengunjung membuka halaman Status.
2. Pengunjung memasukkan kode pelacakan.
3. Frontend mengirim kode melalui POST ke backend.
4. Backend membandingkan hash kode dan mengambil data status yang diizinkan.
5. Frontend menampilkan status umum serta tautan Instagram apabila publikasi berhasil.
6. Kode salah menampilkan respons generik dan tidak membocorkan apakah pesan tertentu ada.

### 9.3 Membaca feed

1. Pengunjung membuka Beranda.
2. Frontend meminta data feed dengan kategori dan cursor.
3. Backend hanya mengembalikan data yang statusnya `published`.
4. Pengunjung bisa membuka detail, menyukai jika tersedia, atau menuju tautan postingan Instagram.

## 10. Model status dan transisi

Status internal yang direkomendasikan:

| Status | Makna | Tampil pada feed? | Status yang dilihat user |
|---|---|---:|---|
| `blocked` | Ditolak oleh aturan otomatis sebelum antrean | Tidak | Tidak dapat diproses |
| `queued` | Pesan tersimpan dan menunggu worker | Tidak | Diterima |
| `processing` | Worker sedang membuat/menyiapkan media | Tidak | Sedang diproses |
| `publishing` | Container/media sedang diproses atau publish dipanggil | Tidak | Sedang dipublikasikan |
| `published` | Instagram mengonfirmasi publikasi | Ya | Berhasil dipublikasikan |
| `retry_scheduled` | Kegagalan sementara dengan retry terjadwal | Tidak | Sedang mengalami kendala |
| `failed` | Gagal setelah kebijakan retry habis atau butuh tindakan operasional | Tidak | Mengalami kendala |

Transisi normal:

```text
submit
  ├── aturan tidak lolos ──> blocked
  └── aturan lolos ────────> queued
                                └──> processing
                                       └──> publishing
                                              ├──> published
                                              ├──> retry_scheduled ──> processing
                                              └──> failed
```

Sistem harus menolak transisi tidak sah. `published` tidak boleh kembali ke `queued` karena retry biasa. Jika ditemukan hasil publish yang ambigu, worker harus merekonsiliasi status dan tidak langsung membuat posting baru.

## 11. Kebutuhan data

Detail final didefinisikan dalam migrasi Supabase, tetapi kontrak logis awal meliputi:

### 11.1 `messages`

- `id`: UUID internal.
- `public_id`: identifier acak/non-sekuensial untuk detail publik jika dibutuhkan.
- `tracking_code_hash`: hash/HMAC kode pelacakan, unique, bukan kode mentah.
- `category`: salah satu kategori yang diizinkan.
- `recipient`: teks opsional dengan batas karakter.
- `content`: isi pesan.
- `status`: status state machine.
- `request_id`: idempotency key unique untuk pengiriman.
- Penyimpanan respons idempotensi terenkripsi di tabel/area terpisah dengan TTL singkat, tidak dibaca klien, dan dibersihkan otomatis.
- `created_at`, `updated_at`, `published_at`: waktu terkait.
- `ig_media_id`, `ig_permalink`: metadata publikasi jika tersedia.
- `rendered_image_path`: path aset hasil render bila dibutuhkan.
- `expires_at`: tanggal retensi/penghapusan jika kebijakan menggunakannya.

### 11.2 `publication_jobs` atau Supabase Queues

- Identitas job dan referensi ke pesan.
- Status job, jumlah percobaan, waktu percobaan berikutnya.
- Informasi lock/lease untuk mencegah dua worker mengerjakan job yang sama.
- Kode error terakhir, timestamp, dan metadata operasional minimum.
- Constraint unik untuk mencegah job publikasi utama terbuat ganda.

Pemilihan tabel antrean sendiri atau Supabase Queues perlu ditentukan saat implementasi berdasarkan kebutuhan visibility timeout, retry, dan operasional. Jangan menjalankan publikasi eksternal di trigger SQL yang membuat request submit lambat.

### 11.3 `message_likes` (opsional)

- `message_id`, `voter_token_hash`, `created_at`.
- Constraint unik gabungan agar token browser yang sama tidak memberi suka duplikat pada pesan yang sama.
- Jumlah suka dihitung oleh server/database.

### 11.4 Prinsip akses data

- Browser tidak memiliki akses baca bebas ke `messages` dan `publication_jobs`.
- Feed, status, dan detail memakai Edge Functions/RPC/view yang memilih kolom terbatas.
- Akses tulis ke status publikasi hanya dari backend.
- RLS dan SQL grants harus disetel dan dites secara eksplisit.
- Hindari menyimpan IP mentah, fingerprint permanen, atau identitas langsung bila tidak diperlukan. Retensi dan pengumpulan metadata harus dijelaskan kepada pengguna.

## 12. Kontrak endpoint aplikasi

Nama berikut merupakan kontrak usulan dan dapat disesuaikan sebelum coding, tetapi tim harus menyepakati dan mengunci kontraknya sebelum integrasi frontend/backend.

### 12.1 `POST /functions/v1/submit-menfess`

Contoh request:

```json
{
  "request_id": "uuid-dari-klien",
  "category": "menfess",
  "recipient": "warga Spenthree",
  "content": "Terima kasih sudah membantu hari ini.",
  "rules_accepted": true
}
```

Respons berhasil (contoh):

```json
{
  "accepted": true,
  "tracking_code": "SPT-<kode-acak-yang-hanya-ditampilkan-saat-ini>",
  "status": "queued",
  "message": "Menfess diterima dan sedang diproses. Simpan kode pelacakanmu."
}
```

Catatan:
- Nilai kode pada contoh hanya placeholder; jangan hardcode.
- Server harus membuat kode acak dan menyimpan hash/HMAC-nya saja di tabel utama.
- Jika request dengan `request_id` yang sama diulang, backend menggunakan respons idempotensi yang disimpan terenkripsi untuk mengembalikan tanda terima/kode yang sama selama masa retensi singkat; respons tersebut tidak boleh masuk log dan harus dihapus otomatis. Setelah TTL berakhir, retry tidak boleh membuat posting ganda.
- Respons submit tidak menunggu publikasi Instagram selesai.

### 12.2 `GET /functions/v1/public-feed?category=...&cursor=...`

Mengembalikan `published` saja dengan pagination. Jangan meneruskan isi pesan yang belum publik atau properti internal.

### 12.3 `GET /functions/v1/public-menfess?id=...`

Mengembalikan detail menfess yang sudah terbit. Identifier harus bersifat publik/non-sekuensial jika mengidentifikasi satu record.

### 12.4 `POST /functions/v1/track-menfess`

Request body berisi kode pelacakan. Jangan menggunakan URL/query string untuk kode tersebut. Respons mengembalikan status user-facing, waktu publikasi jika sukses, dan permalink jika tersedia; hindari mengembalikan isi pesan penuh atau error internal tanpa kebutuhan.

### 12.5 `POST /functions/v1/like-menfess` (P1)

Menerima identifier publik pesan dan token suka yang diverifikasi server. Hanya menerima pesan `published`. Terapkan rate limiting serta respons konsisten untuk suka duplikat.

### 12.6 Worker publikasi internal

Worker harus dipicu melalui mekanisme terjadwal/queue yang diamankan, bukan endpoint terbuka yang dapat dipanggil siapa pun untuk men-trigger publikasi. Autentikasi internal, akses secrets, limit concurrency, dan idempotensi harus diuji.

## 13. Kebutuhan nonfungsional

### 13.1 Keamanan

- TLS/HTTPS untuk seluruh komunikasi.
- Validasi server-side dan query terparameterisasi.
- RLS serta grants minimum pada semua tabel yang berpotensi bisa diakses via API.
- Tidak ada `service_role`, secret Meta, atau access token dalam `VITE_*` atau bundle client.
- CORS bukan satu-satunya mekanisme pengamanan.
- Output teks di-escape; hindari XSS, injection, dan URL berbahaya.
- Batasi payload, request rate, dan retry.
- Logging tidak memuat secret atau konten pribadi secara tidak perlu.

### 13.2 Privasi dan anonimitas

- Tidak meminta nama/email/nomor telepon/akun sosial dari pengirim.
- Tidak menampilkan identitas teknis pengirim di feed, gambar Instagram, atau halaman status.
- Jelaskan bahwa anonimitas pada antarmuka bukan jaminan bahwa seluruh infrastruktur tidak memiliki log teknis.
- Jelaskan bahwa pesan akan menjadi konten publik setelah dipublikasikan; pengirim sebaiknya tidak menaruh informasi yang mengungkap identitas pribadi.
- Terapkan retensi untuk pesan yang diblokir, job gagal dan log sesuai kebijakan yang ditetapkan.
- Sediakan jalur pelaporan dan prosedur pemilik layanan untuk menanggapi konten merugikan. Tidak adanya panel bukan berarti tidak perlu penanggung jawab operasional.

### 13.3 Keandalan

- Submit menyimpan pesan dan job secara konsisten.
- Kegagalan Instagram tidak menghapus pesan atau kode tracking.
- Worker dapat melanjutkan pekerjaan yang gagal secara aman.
- Retry dibatasi dan menggunakan backoff.
- Worker memiliki lock/claim atomik.
- Publikasi yang sudah berhasil tidak diulang akibat timeout tanpa rekonsiliasi.
- Status job dan error dapat didiagnosis dari log operasional minimum.

### 13.4 Kinerja

- Frontend menggunakan pagination, gambar yang dioptimalkan, dan komponen yang dapat digunakan ulang.
- Endpoint feed meminta jumlah data terbatas.
- Submit memberikan tanda terima setelah data dan job tersimpan, bukan menunggu Instagram selesai.
- Beban renderer dipisah dari request publik jika operasi render berat atau tidak sesuai batas runtime.
- Target performa numerik ditetapkan setelah test baseline di staging.

### 13.5 Aksesibilitas dan kemudahan penggunaan

- Desain mobile-first dan responsif.
- Label form jelas; error dapat dibaca screen reader.
- Kontras teks dan fokus keyboard memadai.
- Tombol punya state loading dan tidak dapat ditekan berulang saat request berjalan.
- Pengguna diberi instruksi menyimpan kode tracking dan dapat menyalin kode dengan mudah.

### 13.6 Pemeliharaan

- Source code dikelola di GitHub dengan pull request dan review.
- Schema dikelola melalui migrasi, tidak diubah manual tanpa dicatat.
- Kontrak API dan status dicatat pada dokumentasi.
- `.env.example` berisi placeholder, bukan rahasia.
- Log error memuat correlation/request ID yang aman dan kode error terkontrol.

## 14. Integrasi Instagram: prasyarat dan aturan

1. Akun tujuan harus memenuhi persyaratan akun profesional dan konfigurasi Instagram API yang berlaku saat implementasi.
2. Pemilik proyek harus memiliki akses yang sah ke akun Meta/Instagram tujuan.
3. Aplikasi Meta harus dikonfigurasi dengan metode autentikasi dan permission untuk content publishing sesuai dokumentasi terbaru.
4. Access token, ID akun, versi API dan secret pendukung disimpan di server.
5. Teks pesan dibuat menjadi gambar (misalnya template potret 4:5; ukuran final ditentukan berdasarkan dokumentasi dan hasil uji terbaru).
6. URL media harus dapat diakses oleh Instagram selama proses pengambilan media dan harus memenuhi spesifikasi format/ukuran yang berlaku.
7. Worker membuat media container, memeriksa status sampai siap, lalu memanggil publish sesuai alur API.
8. Status `published` hanya dipakai setelah respons publikasi berhasil dikonfirmasi.
9. Token expired, permission error, rate limit, timeout, dan media tidak dapat diambil harus memiliki jalur penanganan.
10. Sebelum rilis, satu postingan percobaan harus berhasil pada akun uji atau akun tujuan yang disetujui.

Integrasi ini merupakan dependensi kritis. Jika API atau izin belum siap, UI dapat terus dikembangkan dengan mock adapter, tetapi fitur otomatisasi tidak boleh diklaim telah selesai.

## 15. Penanganan error

| Skenario | Perilaku backend | Perilaku UI |
|---|---|---|
| Input invalid | Tolak tanpa membuat job | Tampilkan validasi yang membantu pengguna memperbaiki form |
| Tidak lolos aturan otomatis | Simpan status `blocked` bila diperlukan untuk tracking dan retensi; jangan publikasikan | Tampilkan pesan umum bahwa konten tidak dapat diproses |
| Terbatas karena spam | Tolak/beri status rate limit dan catat sinyal minimum | Minta pengguna menunggu sebelum mencoba lagi |
| Database gagal sebelum tersimpan | Tidak membuat janji bahwa pesan diterima | Tampilkan gagal mengirim dan opsi mencoba kembali |
| Job tersimpan, Instagram sedang proses | Simpan job dan balas tanda terima | Tampilkan status diterima/sedang diproses |
| Renderer gagal | Jadwalkan retry terbatas; jangan publish tanpa gambar valid | Tampilkan sedang mengalami kendala |
| Token/permission API tidak valid | Hentikan job sesuai kategori error, buat alert operasional | Tampilkan status kendala tanpa detail credential |
| Instagram rate limit/5xx | Retry terkontrol dengan backoff | Tetap menunjukkan status belum selesai |
| Timeout setelah perintah publish | Rekonsiliasi status sebelum retry | Tampilkan sedang dipastikan/diproses, bukan menyatakan gagal secara prematur |
| Status tracking tidak ditemukan | Respons generik tanpa detail | Tampilkan kode tidak valid atau status tidak ditemukan |

## 16. Kebijakan otomatis dan risiko konten

Karena pesan dipublikasikan tanpa pemeriksaan manusia, UI wajib menerangkan konsekuensi tersebut secara jelas sebelum tombol kirim. Aturan otomatis minimal menolak pola yang dapat ditentukan dengan pendekatan yang dapat diuji, seperti:

- Isi kosong, spam berulang, tautan berbahaya atau payload mencurigakan.
- Nomor telepon, alamat, atau pola data pribadi jika terdeteksi oleh filter.
- Ancaman atau kata/pola pelecehan yang terdaftar pada aturan filter.
- Isi berulang atau upaya bypass batas karakter/rate limit.
- Kategori tidak dikenal atau permintaan yang mengubah field internal.

Daftar istilah dan pola harus dirawat dengan hati-hati untuk mengurangi false positive. Jangan mengklaim bahwa filter berbasis aturan mampu memahami semua konteks, sarkasme, atau nama orang secara akurat. Dalam keadaan meragukan, sistem sebaiknya menahan atau menolak publikasi otomatis daripada membuat klaim keamanan yang tidak benar.

Dokumen dan UI harus memberi tahu pengguna bagaimana melaporkan postingan yang bermasalah. Pemilik layanan tetap perlu mempunyai prosedur operasional untuk menindaklanjuti laporan, termasuk cara meminta penghapusan melalui jalur resmi, meskipun produk tidak memiliki panel staf.

## 17. Acceptance test sebelum rilis

| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| AT-01 | Membuka Beranda tanpa login | Feed publik dapat dibaca tanpa meminta identitas |
| AT-02 | Membuka Beranda saat ada pesan queued | Pesan queued tidak terlihat |
| AT-03 | Mengirim form kosong | Validasi mencegah submit dan server juga menolak request langsung |
| AT-04 | Mengirim kategori tidak valid via API | Server menolak tanpa job publikasi |
| AT-05 | Mengirim pesan valid setelah setuju aturan | Satu pesan dan satu job tersimpan, kode tracking ditampilkan |
| AT-06 | Mengirim request yang sama dua kali | Tidak ada duplicate job/post untuk idempotency key yang sama |
| AT-07 | Menggunakan kode tracking valid | Status aman ditampilkan; jika published, tautan tersedia bila ada |
| AT-08 | Menggunakan kode tracking salah | Tidak ada informasi pesan lain yang terungkap |
| AT-09 | Menyelesaikan pipeline Instagram sukses | Media ID disimpan, status `published`, feed diperbarui |
| AT-10 | Instagram API error sementara | Job dijadwalkan retry dengan backoff, tidak membuat duplicate post |
| AT-11 | Token Instagram tidak valid | Job gagal/tertahan aman, error internal tidak dikirim ke pengguna |
| AT-12 | Mencoba membaca tabel internal dari browser | Akses ditolak oleh grants/RLS atau endpoint tidak mengembalikan data tersebut |
| AT-13 | Memasukkan teks dengan markup/script | Teks ditampilkan sebagai teks biasa, tidak dieksekusi |
| AT-14 | Mencoba submit cepat berulang | Rate limit/anti-abuse bekerja dan tidak membanjiri antrean |
| AT-15 | Membuka pada viewport mobile | Navigasi, form, feed, dan status tetap dapat digunakan |
| AT-16 | Membuka Panduan | Aturan, privasi, cara tracking, publikasi otomatis, dan jalur pelaporan terlihat |

## 18. Ketergantungan dan asumsi

- Akun Instagram tujuan dan pihak yang berhak mengelolanya akan tersedia.
- Meta Developer App dapat dikonfigurasi dan izin content publishing yang diperlukan dapat diperoleh.
- Supabase project dapat dipakai untuk PostgreSQL, Edge Functions, dan Storage/Queues sesuai implementasi.
- Figma dan screenshot merupakan acuan UI yang disetujui, tetapi detail desain yang tidak terlihat masih perlu dikonfirmasi tim.
- Isi awal dibatasi 10–500 karakter sampai ada keputusan final.
- Nama pengguna, login, tanggapan OSIS, dan panel staf bukan bagian dari MVP.
- Waktu pengerjaan disepakati terpisah dalam PLAN karena tanggal rilis dan jam kerja anggota belum ditentukan.

## 19. Risiko produk utama

- **Publikasi tanpa pemeriksaan manusia:** mengurangi hambatan operasional namun meningkatkan risiko konten berbahaya terbit. Mitigasi yang disyaratkan: consent eksplisit, filter otomatis, rate limit, aturan, jalur laporan, dan pemilik operasional.
- **Ketergantungan Instagram API:** akses atau publishing limit dapat berubah. Mitigasi: spike integrasi awal, pemantauan, retry, dan prosedur re-autentikasi.
- **Anonimitas disalahartikan:** pengguna mengira tidak ada metadata teknis sama sekali. Mitigasi: kebijakan privasi menyatakan batas anonimitas secara jujur.
- **Tracking code bocor:** siapa pun yang memiliki kode mungkin dapat memeriksa status. Mitigasi: kode tidak mudah ditebak, hash/HMAC di server, rate limit, respons minimal, dan instruksi menjaga kode.
- **Spam dan bot:** endpoint tanpa login mudah diserang. Mitigasi: kontrol berlapis dan kapasitas antrean terbatas.
- **Duplikasi saat timeout:** API mungkin sudah mempublikasikan walau respons tidak sampai ke worker. Mitigasi: rekonsiliasi sebelum retry.
- **Data sensitif tersimpan terlalu lama:** konten menfess dapat berisi informasi pribadi. Mitigasi: retensi, minimisasi log, dan prosedur penghapusan.

## 20. Kriteria selesai produk

MVP dinyatakan siap rilis jika seluruh syarat berikut terpenuhi:

- Halaman utama mengikuti desain dan bisa dipakai pada mobile/desktop.
- Submit anonim, preview, tracking, detail, dan panduan berjalan.
- Validasi otomatis dan anti-spam aktif pada server.
- Pesan valid menjalani pipeline gambar dan publikasi Instagram otomatis.
- Feed hanya menampilkan posting yang berhasil dipublikasikan.
- Status dan retry dapat dipantau dan tidak membuat duplikasi.
- RLS, grants, rate limit, dan kontrol kredensial diuji.
- Kebijakan privasi dan aturan konten menjelaskan publikasi dan batas anonimitas.
- Acceptance test inti lulus; tidak ada bug kritis atau credential exposure yang diketahui.
- Pemilik akun Instagram dan penanggung jawab operasional telah menyetujui proses rilis.

## 21. Referensi

- Instagram Platform: https://developers.facebook.com/docs/instagram-platform/
- Meta Content Publishing: https://developers.facebook.com/documentation/instagram-platform/content-publishing
- Instagram Graph API — IG User Media: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Queues: https://supabase.com/docs/guides/queues
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Function secrets: https://supabase.com/docs/guides/functions/secrets

---

**Pemeliharaan PRD:** setiap perubahan scope fitur, status, kategori, alur publikasi, atau kebijakan data harus diperbarui pada PRD dan diselaraskan dengan `PLAN-Menfess-Spenthree.md` serta `ARSITEKTUR_MENFESS_SPENTHREE.md`.
