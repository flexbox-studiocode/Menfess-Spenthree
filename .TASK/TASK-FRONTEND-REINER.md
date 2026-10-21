# Task Implementasi — Frontend Full (Reiner)

**Pemilik:** Reiner  
**Tanggung jawab:** Seluruh implementasi UI dan frontend Menfess Spenthree.  
**Dokumen acuan:** `ARSITEKTUR_MENFESS_SPENTHREE.md`, `PLAN-Menfess-Spenthree.md`, `PRD-Menfess-Spenthree.md`, dan Figma Sagara.

## Batasan produk yang harus dijaga

- Website untuk pengirim anonim; tidak ada login atau registrasi pengguna.
- Tidak ada panel admin dan panel moderator.
- Pesan yang lolos validasi server akan diterbitkan otomatis ke Instagram; tidak ada persetujuan manual.
- Frontend tidak boleh mengakses Instagram API secara langsung, menyimpan Instagram token, atau menggunakan Supabase service-role key.
- Status publikasi berasal dari backend. Frontend tidak boleh mengubah pesan menjadi `published` berdasarkan asumsi.
- Fitur tanggapan OSIS bukan bagian dari MVP.
- Gunakan kontrak API yang disepakati dengan Kiandra. Selama backend belum tersedia, gunakan mock service lokal yang bentuk responsnya identik dengan kontrak tersebut.

## Task R-01 — Setup UI dan design system

- [ ] Pelajari semua layar dan alur yang diberikan melalui Figma/screenshot.
- [ ] Buat design tokens untuk warna, font, spacing, border, radius, shadow dan breakpoint.
- [ ] Buat komponen dasar reusable: Button, Input, Textarea, Select/Category, Card, Badge/Status, Modal/Confirmation, Toast/Alert, Skeleton dan Empty State.
- [ ] Konsisten dengan pilihan styling dari setup proyek Kiandra; jangan menambahkan styling system kedua.
- [ ] Pastikan fokus keyboard, label input, kontras dan touch target memadai.
- [ ] Jangan mengubah keputusan visual utama tanpa koordinasi dengan tim.

**Selesai jika:** komponen konsisten, halaman mobile-first dapat menggunakan komponen bersama, dan setup tidak berkonflik dengan fondasi Kiandra.

## Task R-02 — Layout dan navigasi

- [ ] Implementasikan shell/layout utama.
- [ ] Buat navigasi menuju Beranda, Tulis Menfess, Periksa Pesan/Status, dan Panduan sesuai alur desain.
- [ ] Pastikan routing React Router berjalan saat akses langsung dan refresh halaman.
- [ ] Buat layout responsif mobile dan desktop.
- [ ] Sediakan state navigasi aktif dan penanganan route tidak ditemukan.
- [ ] Hindari halaman atau menu panel admin/moderator.

**Selesai jika:** semua halaman inti dapat diakses melalui navigasi, tidak ada route mati, dan refresh tidak merusak tampilan/route.

## Task R-03 — Beranda dan feed

- [ ] Implementasikan feed menfess dengan kartu sesuai desain.
- [ ] Tampilkan kategori, isi, waktu publikasi dan field publik lain sesuai kontrak API.
- [ ] Implementasikan filter kategori: Semua, Menfess, Aspirasi, Curhat, Apresiasi (ikuti daftar final dari Kiandra).
- [ ] Buat urutan default terbaru sesuai response API.
- [ ] Implementasikan pagination/load more atau mekanisme cursor sesuai backend.
- [ ] Buat loading skeleton, empty state, error state dan tombol coba lagi.
- [ ] Hanya tampilkan data dari public-feed; jangan membaca tabel internal secara langsung.

**Selesai jika:** filter/pagination berjalan, feed tidak menampilkan mock data saat backend diaktifkan dan semua state memiliki UI yang layak.

## Task R-04 — Form Tulis Menfess

- [ ] Buat formulir dengan kategori, penerima opsional, isi pesan, dan checkbox persetujuan aturan/publikasi.
- [ ] Validasi frontend untuk membantu pengguna: input kosong, panjang minimal/maksimal, kategori, dan recipient.
- [ ] Tampilkan jumlah karakter dan pesan validasi yang mudah dipahami.
- [ ] Buat tombol disabled/loading selama submit berlangsung.
- [ ] Cegah submit berulang di sisi UI, tetapi tetap andalkan idempotensi backend.
- [ ] Jelaskan secara jelas bahwa pesan yang lolos validasi otomatis dapat dipublikasikan ke Instagram dan website.
- [ ] Jangan meminta nama, email, nomor telepon, password atau akun sosial pengguna.
- [ ] Jangan menampilkan klaim bahwa filter otomatis menjamin seluruh konten bermasalah terdeteksi.

**Selesai jika:** form memenuhi desain, persetujuan wajib dicentang, validasi jelas, dan request menggunakan service layer yang disepakati.

## Task R-05 — Periksa Pesan / preview

- [ ] Implementasikan tampilan pratinjau isi sebelum dikirim sesuai screenshot.
- [ ] Pastikan kategori, penerima, dan isi terlihat sebagaimana akan disajikan.
- [ ] Sediakan aksi kembali/edit dan aksi kirim.
- [ ] Pastikan kembali dari preview tidak menghapus input tanpa konfirmasi yang sesuai.
- [ ] Jelaskan kembali konsekuensi publikasi di tempat yang tepat.
- [ ] Ini adalah pemeriksaan oleh pengirim sendiri, bukan panel moderation/review oleh staf.

**Selesai jika:** pengguna bisa memeriksa, mengedit, lalu mengirim pesan tanpa kehilangan data secara tidak sengaja.

## Task R-06 — Hasil submit dan kode tracking

- [ ] Tangani response sukses dari submit-menfess.
- [ ] Tampilkan kode tracking yang dikembalikan backend dengan tombol salin.
- [ ] Jelaskan bahwa kode perlu disimpan untuk melihat status dan mungkin tidak dapat ditampilkan kembali.
- [ ] Tampilkan status awal yang berasal dari backend, misalnya `queued`/`processing`.
- [ ] Jangan membuat atau menebak tracking code di frontend.
- [ ] Tangani validasi ditolak, rate limit, timeout, jaringan terputus dan error server.
- [ ] Pada timeout ambigu, arahkan pengguna untuk memeriksa status/hasil request sebelum melakukan submit baru.

**Selesai jika:** kode yang ditampilkan berasal dari backend, dapat disalin, dan error tidak mendorong pengguna membuat posting duplikat.

## Task R-07 — Halaman Status / Periksa Pesan

- [ ] Buat form memasukkan kode tracking.
- [ ] Kirim tracking code melalui POST body/service layer, bukan query URL.
- [ ] Tampilkan status publikasi dan penjelasan yang aman untuk pengguna.
- [ ] Tangani `queued`, `processing`, `publishing`, `published`, `retry_scheduled`, `failed` dan `blocked` sesuai kontrak backend.
- [ ] Tampilkan tautan Instagram hanya ketika permalink tersedia.
- [ ] Gunakan polling terbatas dengan backoff untuk status nonterminal; berhenti ketika status terminal.
- [ ] Jangan memperlihatkan stack trace, kode internal, isi error Meta, maupun data operasional.
- [ ] Tampilkan feedback kode tidak valid/expired tanpa membocorkan data milik orang lain.

**Selesai jika:** halaman status bekerja menggunakan backend dan semua status dapat dijelaskan kepada pengguna dengan bahasa sederhana.

## Task R-08 — Detail menfess dan Panduan

- [ ] Buat halaman detail menfess `published`.
- [ ] Tampilkan kategori, waktu, isi, jumlah suka jika tersedia, dan permalink Instagram bila tersedia.
- [ ] Tangani ID tidak valid atau konten yang tidak tersedia.
- [ ] Buat Panduan berisi alur penggunaan, aturan konten, larangan menyebarkan identitas/data pribadi, dan penjelasan anonimitas.
- [ ] Buat halaman atau dialog Kebijakan Privasi/Aturan Penggunaan yang menjelaskan publikasi otomatis.
- [ ] Tidak menambahkan fitur tanggapan OSIS tanpa perubahan scope yang disetujui tim.

**Selesai jika:** detail hanya menerima data published dan panduan menerangkan konsekuensi publikasi dengan jelas.

## Task R-09 — Suka (opsional/P1)

- [ ] Implementasikan tombol suka hanya setelah endpoint/kontrak anti-abuse dari Kiandra siap.
- [ ] Tampilkan jumlah suka sesuai response server.
- [ ] Tangani loading, error dan retry.
- [ ] Hindari menganggap localStorage/cookie sebagai proteksi penyalahgunaan sempurna.
- [ ] Bila backend anti-abuse belum siap, sembunyikan/nonaktifkan fitur untuk MVP dan dokumentasikan keputusan.

**Selesai jika:** UI suka terhubung ke endpoint resmi dan tidak memanipulasi hitungan secara permanen di frontend.

## Task R-10 — Responsivitas, aksesibilitas dan QA frontend

- [ ] Uji viewport ponsel kecil, ponsel besar/tablet, laptop dan desktop.
- [ ] Periksa overflow teks panjang, Unicode, wrapping dan layout card.
- [ ] Uji navigasi keyboard/focus, label input, kontras dan touch target.
- [ ] Uji loading, empty, error, submit sukses, tracking invalid dan publikasi gagal.
- [ ] Periksa console error dan network request yang gagal.
- [ ] Pastikan tidak ada token rahasia dalam bundle, console log, atau source code frontend.
- [ ] Hapus mock data dari jalur produksi setelah endpoint tersedia.
- [ ] Buat screenshot sebelum/sesudah untuk PR bila perubahan visual signifikan.

**Selesai jika:** halaman utama responsif, tidak ada bug visual kritis, tidak ada rahasia dalam bundle, dan QA frontend dicatat.

## Kontrak integrasi dengan Kiandra

Reiner bertanggung jawab pada UI dan konsumsi API dari sisi frontend. Kiandra bertanggung jawab menyiapkan proyek awal, backend, endpoint, skema response, integrasi backend–frontend, QA gabungan dan deployment Vercel.

Endpoint yang direncanakan:
- `POST /functions/v1/submit-menfess`
- `GET /functions/v1/public-feed?category=...&cursor=...`
- `GET /functions/v1/public-menfess?id=...`
- `POST /functions/v1/track-menfess`
- `POST /functions/v1/like-menfess` (P1/opsional)

Sebelum API selesai, buat mock service di file terpisah. Jangan hardcode URL atau bentuk response di banyak komponen. Gunakan satu service layer yang nanti dapat diarahkan ke endpoint asli oleh Kiandra.

## Usulan branch

- `feature/design-system`
- `feature/app-layout`
- `feature/home-feed`
- `feature/menfess-form`
- `feature/menfess-preview`
- `feature/tracking-status`
- `feature/detail-guide`
- `test/frontend-responsive`

## Kriteria penerimaan akhir frontend

- [ ] Desain inti sesuai Figma dan nyaman digunakan pada mobile/desktop.
- [ ] Navigasi ke seluruh halaman inti berfungsi.
- [ ] Form mengirim request yang cocok dengan kontrak backend.
- [ ] Tracking code dan status berasal dari server.
- [ ] Beranda/detail tidak menampilkan data unpublished.
- [ ] Tidak terdapat login, panel admin, atau panel moderator.
- [ ] Semua loading, empty, error, dan success state penting tersedia.
- [ ] Frontend dapat build dengan berhasil dan PR siap diintegrasikan Kiandra.
