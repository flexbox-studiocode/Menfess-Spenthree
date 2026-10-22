# Micro interactions SAGARA

Implementasi dari rekomendasi yang disetujui pengguna, 22 Oktober 2026. CSS Modules dan state React yang ada digunakan tanpa dependency baru. Identitas visual, sumber data, dan kontrak backend dipertahankan; empty state mendapat ikon dan CTA.

1. Feedback tombol, focus field, checkbox, dan counter karakter. Validasi memfokuskan field pertama yang salah, menghubungkan deskripsi error, dan melakukan scroll ke field tersebut; pada reduced motion scroll langsung.
2. Indikator navigasi/kategori bergeser. Tulis–Periksa dan Ubah Pesan memakai arah berlawanan, dengan shared element textarea–pratinjau melalui View Transition API jika tersedia. Browser tanpa API tetap menavigasi dan menyimpan draf. BrowserRouter tetap dipakai, dengan useTransitions=false agar snapshot mendapatkan DOM route baru secara sinkron.
3. Progress periksa, spinner saat request, kartu hasil, dan feedback clipboard mengikuti state sebenarnya. Setelah respons submit berhasil, amplop menutup menjadi centang. Titik status menampilkan satu ring pada hasil asli; status tidak berpindah secara simulasi.
4. Hero bertahap, ikon dan CTA empty state, serta underline link pada hover/focus keyboard. Panduan melakukan reveal setiap aturan sekali per kunjungan ketika terlihat di atas navigasi bawah. Konten tetap terlihat tanpa dukungan animasi; perubahan preferensi ke reduce membatalkan reveal aktif. Tidak menambahkan feed/skeleton fiktif.
5. Semua animasi dekoratif mengikuti prefers-reduced-motion. Tidak ada gerakan ambient yang berulang terus.
6. Verifikasi regresi API/draf, animasi di browser pada beberapa viewport, reduced motion, lint/build; baru commit/push melalui akun pengguna.

## Hasil verifikasi

- 35 tes Vitest lulus, termasuk batas counter449/450/500/501 karakter Unicode, persetujuan, draf, retry request_id identik, receipt, clipboard sukses/gagal, fokus/deskripsi field invalid, navigasi fallback, snapshot yang dilewati browser, dan cleanup saat transisi diinterupsi.
- Lint dan build lulus. Peringatan bundle Vite di atas500kB sudah ada sebelumnya; tanpa dependency baru.
- node scripts/motion-audit.mjs: 93 pemeriksaan lulus, tanpa runtime error. Browser memeriksa keyframes asli, snapshot pesan dan arah maju/mundur, fallback tanpa API, fokus/scroll validasi, tidak ada intro ganda setelah transisi, ring/amplop/centang setelah respons, reveal sekali per aturan, pembatalan reveal ketika preferensi berubah, underline keyboard, transform indikator kategori, feedback tekan CTA, lebar loading, retry, dan clipboard.
- Kedua mode prefers-reduced-motion diperiksa. Pada reduce, gerak halaman, pseudo-element, checkbox, spinner dan transisi dinonaktifkan; fungsi dan status loading tetap tersedia.
- Tujuh route pada320/375/412/768/1440px diperiksa, tanpa overflow atau aset rusak. Screenshot dan report lokal ada di artifacts/motion-audit; artefak tersebut tidak disertakan dalam commit.
- Request backend dalam audit menggunakan fixture browser yang diintersep. src/services, src/lib/supabase.js, environment file, dependency dan kontrak backend tidak diubah. Produksi Supabase/Instagram dan perangkat fisik belum diuji.
- Review independen tidak menemukan blocker pada perubahan frontend/dataflow. Build produksi diperiksa langsung pada320/1440px dalam mode normal/reduce: 19 pemeriksaan transisi, isi pesan, fokus, draf, dan overflow lulus. Tidak melakukan pengiriman API pada pemeriksaan build produksi.
- Animasi kartu feed ditunda karena backend feed belum tersedia. Tidak ada skeleton atau data contoh yang ditampilkan seolah-olah data produksi.
