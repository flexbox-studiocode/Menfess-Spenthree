# Optimasi performa SAGARA

## Batas perubahan

Pertahankan desain Figma, semua route, animasi, draft/sessionStorage, request_id, validasi, timeout HTTP, serta kontrak Supabase dan backend. Optimasi ditujukan pada payload awal yang terukur, tanpa dependency baru atau perubahan database.

## Perubahan

- src/services/index.js memuat modul koneksi Supabase melalui dynamic import saat submit/track diminta. Draft dan halaman biasa tidak perlu memuat SDK. API fungsi, payload, error handling, singleton client, dan konfigurasi autentikasi tetap sama.
- Timer HTTP20 detik untuk submit dan15 detik untuk track tetap dimulai sesudah client tersedia. Pada aksi pertama, download SDK berlangsung sebelum timer HTTP tersebut; bukan jaminan batas waktu total dari klik sampai respons.
- Enam font Inter dikompres dari TTF menjadi WOFF2. Semua 2.849 pemetaan karakter per font, advance widths, bobot, dan outline setiap glyph dibandingkan dengan sumber TTF menggunakan FontTools/RecordingPen; tidak melakukan subset atau mengubah desain huruf. Sumber TTF sebelum optimasi masih tersedia dalam riwayat Git.
- Total font 1.957.224 menjadi 665.364 byte, berkurang 66%. File TTF yang sudah tidak dirujuk digantikan oleh WOFF2.
- JavaScript entry produksi 510.749 menjadi 286.375 byte; SDK terpisah sekitar225 kB hanya dimuat saat diperlukan. Tidak mengubah chunk limit untuk menyembunyikan warning.
- Preload dua font sempat diuji. Pada pengukuran awal, FCP HP menjadi lebih lambat karena bersaing dengan JavaScript; preload tersebut tidak dipertahankan.
- ESLint mengecualikan artifacts/ karena berisi output audit/build, bukan source aplikasi.

## Pengukuran

scripts/performance-audit.mjs memakai Playwright yang sudah tersedia di instalasi pengujian sementara, bukan dependency aplikasi. Build sebelum perubahan disalin ke artifacts/performance-audit/baseline-dist dan dilayani pada5175; build setelah perubahan pada5176. Masing-masing memakai browser context baru, cache dinonaktifkan, dan pengaturan identik.

- HP: viewport412×929, CPU4x, jaringan1,6 Mbps, latency150 ms.
- Laptop: viewport1440×929, CPU1x, jaringan10 Mbps, latency40 ms.
- Tiga pasangan baseline/optimized per perangkat; median FCP/LCP dipakai untuk membatasi pengaruh variasi satu run.
- LCP/FCP/CLS, long tasks di atas50 ms, resource bytes, font requests, overflow dan runtime error dicatat. jsBytes/fontBytes/totalBytes menggunakan decodedBodySize: ukuran sesudah dekompresi, bukan transfer jaringan aktual. Long-task blocking adalah metrik audit internal, bukan skor Lighthouse TBT atau field INP.
- Semua pengukuran memakai build produksi lokal. Tidak mengirim data ke backend produksi.

Perintah perbandingan:

```powershell
node scripts/performance-audit.mjs comparison http://127.0.0.1:5175 http://127.0.0.1:5176
```

Artefak terperinci berada di artifacts/performance-audit/comparison/report.json. Screenshot sebelum/sesudah tersedia dalam folder yang sama.

## Hasil akhir

Catatan integrasi Git: pengukuran di bawah dibuat pada5797c11 sebelum fitur public-feed/public-menfess dari e9d6485 masuk. Saat publikasi, kedua fitur baru dipertahankan. Validasi konfigurasi dipindahkan tanpa perubahan ke src/lib/supabaseConfig.js agar feed/detail memakai fetch GET tanpa menarik SDK penuh; ekspor lama dari src/lib/supabase.js tetap kompatibel. Angka benchmark di bawah adalah hasil tahap optimasi sebelum penyatuan fitur feed, bukan hasil ukur ulang website dengan data feed produksi.

Setelah penyatuan: 88 tes, lint, dan build kembali lulus. Entry JS292,55 kB dan SDK224,02 kB terpisah; tidak ada warning chunk500 kB. Audit browser97 pemeriksaan diulang pada source terbaru, ditambah13 pemeriksaan feed berisi data, filter kategori, pagination/deduplikasi, detail, SDK tetap ditunda, dan overflow360/1440px. Semua lulus tanpa runtime error, memakai fixture browser tanpa menulis ke backend produksi. Implementasi validasi konfigurasi dan singleton/auth dibandingkan verbatim dengan origin/main; tidak berubah selain lokasi modul.

Median tiga pasangan pada kondisi di atas, 22 Oktober2026:

| Metrik | Sebelum | Sesudah |
| --- | ---: | ---: |
| HP: FCP | 1.384 ms | 1.080 ms |
| HP: LCP | 9.816 ms | 4.328 ms |
| Laptop: FCP | 308 ms | 268 ms |
| Laptop: LCP | 664 ms | 616 ms |
| JS awal, decoded | 510.749 byte | 286.375 byte |
| Font beranda, decoded | 1.631.920 byte | 553.620 byte |
| Seluruh resource beranda, decoded | 2.328.646 byte | 1.025.966 byte |

LCP simulasi HP turun sekitar56%, JS awal44%, seluruh resource awal56%. CLS tetap sama dalam pengukuran berpasangan; tidak ada overflow atau browser runtime error. Selisih LCP laptop lebih kecil, sekitar7%; jangan menganggap hasil ini sebagai jaminan untuk semua laptop/jaringan.

Validasi:

- 88 tes Vitest lulus, termasuk deferred SDK, request submit/track, error, stable request_id/retry, draft, dan konfigurasi/auth Supabase.
- Lint dan build lulus; chunk terbesar286,38 kB, warning chunk di atas500 kB tidak muncul lagi. SDK225,11 kB terpisah.
- 97 pemeriksaan browser pada build produksi fixture lulus: SDK tidak diunduh saat beranda, dimuat ketika submit, response503/retry identik, receipt hanya sesudah sukses, tracking, clipboard, fokus, transisi maju/mundur/fallback, reduced motion, reveal, serta tujuh route pada320/375/412/768/1440px tanpa overflow/aset rusak.
- Fixture produksi dibangun terpisah di artifacts/performance-audit/fixture-dist, memakai URL.invalid dan public key dummy khusus browser. Tidak mengubah .env atau build utama dist/. Seluruh request submit/track diintersep; tidak menulis ke Supabase/Instagram produksi.
- 15 pemeriksaan tambahan pada emulasi touch360px/DPR2, pointer coarse, kedua preferensi motion, dan tiga kali bolak-balik Tulis–Periksa lulus; draft tetap sama, SDK belum dimuat selama menyunting, dan tidak ada runtime error.
- Screenshot412/1440px sebelum/sesudah memiliki dimensi sama. Perbandingan piksel menemukan22 piksel berbeda di HP dan7 di laptop, tanpa perubahan CSS layout/typography; outline dan metrics font juga diverifikasi satu per satu.
- Review independen tidak menemukan blocker pada source/callers. Batas decoded byte dan timer HTTP di atas sudah disertakan dalam laporan.

## Acuan

- [Vite: async chunk loading](https://vite.dev/guide/features.html#async-chunk-loading-optimization)
- [web.dev: best practices for fonts](https://web.dev/articles/font-best-practices)

Hasil lab tidak membuktikan performa perangkat fisik, kondisi produksi, atau waktu layanan backend/Instagram. Penurunan byte dilaporkan terpisah dari hasil timing.
