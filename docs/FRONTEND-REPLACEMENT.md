# SAGARA — penggantian frontend

## Arsitektur dan batas integrasi

Baseline commit: `7af8e6b`. React 19, Vite 7, React Router 7, CSS Modules; global reset pada App.css. Tidak ada autentikasi pengguna. Supabase client mempertahankan persistSession=false, autoRefreshToken=false, detectSessionInUrl=false; konfigurasi publik divalidasi di src/lib/supabase.js. Tidak ada akses browser langsung ke tabel internal.

| Route | State / event | Backend |
|---|---|---|
| / | kategori feed, empty/loading/error | public-feed dirancang tetapi fungsi belum ada di checkout; UI tidak mengarang pesan |
| /write | kategori, penerima, isi, persetujuan; simpan draft sessionStorage | validasi frontend, lanjut /review |
| /review | draft, request_id tetap pada retry, loading/error, receipt sukses | submit-menfess POST; clear draft hanya sukses |
| /status | kode tracking di state, submit/retry | track-menfess POST; kode tidak dimasukkan URL |
| /menfess/:id | public_id dari route | public-menfess dirancang tetapi fungsi belum ada di checkout |
| /guide | navigasi dan informasi | tidak ada request |

## Perbedaan terverifikasi sebelum implementasi

| Element | Figma Specification | Current Implementation | Difference | Priority |
|---|---|---|---|---|
| Background | #181d27 | #f8f9fb di App.css | tema terang berlawanan | P0 |
| Text / surface | putih / #222936 | #19212e / #fff | seluruh token lama harus diganti | P0 |
| Font | Inter | system-ui/Segoe UI | family berbeda | P0 |
| Heading | 24px weight900 | clamp(2rem,6vw,3.5rem) | minimal32px vs24px | P0 |
| Header | 64px, avatar34px, account+school | judul teks dan nav di header | struktur tidak sama | P0 |
| Navigation | bawah, empat ikon, tinggi67px | di header, wrapping | hierarki/navigasi tidak sama | P0 |
| Mobile gutter | kiri19 kanan20 pada412px |16px | selisih3–4px | P1 |
| Home | hero373x196, tabs373x48, feed cards | dua CTA dan placeholder | seluruh komposisi belum ada | P0 |
| Write | select40px, textarea139px, privacy85px, tombol50px | input padding.75rem, textarea144px minimum, tidak ada privacy card | struktur dan ukuran berbeda | P0 |
| Form flow | write/review steps | tidak ada progress | elemen hilang | P1 |
| Radius |10px |.6rem=9.6px | token diselaraskan | P2 |

Nilai implementasi awal di atas diverifikasi dari source sebelum penggantian; screenshot runtime direkam terpisah sebelum source diubah. Frame desain tersedia hanya mobile412px; tablet/desktop merupakan perluasan responsif dengan token/hierarki yang sama, bukan spesifikasi Figma yang dikarang.

## Keputusan kompatibilitas

Tidak menambahkan moderator, likes, tanggapan OSIS, atau data feed hardcoded. Copy informasi memakai alur otomatis sesuai backend. Error/empty belum tersedianya endpoint publik ditampilkan sebagai state nyata. Tidak mengubah database, Edge Functions, konfigurasi env, kontrak, atau auth.

Spesifikasi empat halaman tambahan ada pada FIGMA-PAGE-SPECS.md. Artefak desain (counter statis, nav ganda, fixture tidak konsisten) bukan fitur aplikasi.

## Validasi

Implementasi selesai pada 21 Oktober 2026 untuk lapisan visual yang dapat dijalankan dengan kemampuan backend saat ini. Figma dibaca kembali melalui MCP pada halaman 52:2, lalu keenam frame dibaca dengan context lengkap dan screenshot. Ekspor asli 412px tersimpan di artifacts/figma. Screenshot baseline yang sudah ada dipertahankan.

## Halaman dan struktur yang diganti

- AppLayout: header dua logo dengan crop Figma, identitas akun/sekolah, navigasi bawah empat tujuan, active state termasuk review, skip link, reset scroll/focus saat berpindah halaman.
- Page dan Page.module.css: seluruh hierarki, ukuran, spacing, controls, state, dan layout menggantikan CSS visual lama; tidak ada halaman paralel.
- HomePage: hero, CTA, pemberitahuan privasi, judul linimasa, lima pilihan kategori, state belum tersedia.
- WritePage: progress dua langkah, kategori/penerima/isi dinamis, counter, panel anonim, checkbox fungsional, validasi, dan navigasi review.
- ReviewPage: pratinjau draf asli, kategori, penerima, submit/error/loading/retry, edit, persetujuan, dan panel anonim. Request ID disimpan juga di state komponen agar retry dalam sesi halaman yang sama menggunakan ID yang sama.
- StatusPage: input dan POST pelacakan asli, receipt hasil submit, status aman dari respons backend, timestamp, Instagram, copy kode dengan fallback bila clipboard ditolak.
- GuidePage: about, empat panduan, panel bantuan, penjelasan privasi yang mempertahankan kondisi sebenarnya.
- DetailPage dan NotFoundPage: fallback dengan desain baru dan navigasi yang tetap tersedia.
- MessageFormParts: tiga komponen bersama untuk progress, privasi, dan persetujuan; tanpa dependensi baru.
- index.html: identitas SAGARA, deskripsi, dan theme color. Seluruh font/gambar/ikon yang dipakai berasal dari file lokal; tidak ada URL aset sementara Figma di runtime.

## Perbandingan visual pada ukuran identik

Screenshot hasil akhir: artifacts/visual-audit/verified/{home,write,review,status,guide,detail}-412.png. Ukuran viewport sesuai tinggi masing-masing frame: 1620, 929, 862, 789, 932, 568px. Data draf untuk screenshot write/review hanya fixture pengujian; bukan konten hardcoded di halaman aplikasi.

| Elemen | Target Figma | Hasil browser |
|---|---|---|
| Home hero | x19 y143, 373×196 | x19 y143, 373×196 |
| Home kategori | x19 y439, 373×48 | x19 y439, 373×48 |
| Write kategori | x19 y228, 373×40 | x19 y228, 373×40 |
| Write penerima | y319, 373×40 | y319, 373×40 |
| Write textarea | y409, 373×139 | y409, 373×139 |
| Write/Review privasi | y600, 373×85 | y600, 373×85 |
| Status input | y189, 373×40 | y189, 373×40 |
| Guide about | y173, 373×120 | y173, 373×120 |
| Guide bantuan | x22 y730, 373×81 | x22 y730, 373×81 |

Visual keenam screenshot diperiksa. Token warna, radius, font Inter 400–900, crop logo, dan geometri aset diselaraskan. Beberapa layer Figma memiliki perbedaan alignment horizontal 1px, text box lebih lebar daripada gutter, nav duplikat, dan counter fixture yang tidak sesuai isi. Layout menggunakan aliran dokumen, tidak menyalin overflow atau elemen duplikat tersebut. Rasterisasi teks browser Windows tidak identik dengan renderer Figma; tidak ada klaim pixel-perfect.

Perbedaan yang memang diperlukan: linimasa/detail menampilkan state belum tersedia, bukan pesan dan jawaban contoh; status menampilkan hanya status nyata yang dikembalikan backend, bukan tiga tahap moderator/OSIS fiktif. Copy moderator diselaraskan menjadi validasi otomatis. Navbar lengkap dipakai pada semua halaman meskipun frame Home hanya menggambar dua ikon. Tablet/desktop memakai kolom terpusat maksimum760px; tidak ada frame Figma tablet/desktop untuk dibandingkan.

## Integrasi dan hasil pengujian

- npm.cmd test: 24 tes lulus, tiga file tes. Mencakup konfigurasi publik/auth singleton, tujuh route, navigasi, validasi, draf, review tanpa draf, persetujuan, edit, submit gagal/retry/sukses, POST tracking, status publikasi, error, serta penolakan clipboard.
- npm.cmd run lint: lulus tanpa warning.
- npm.cmd run build: lulus; Vite memberi peringatan chunk JavaScript sekitar505kB. Tidak menambahkan dependency atau mengubah konfigurasi bundler di luar scope.
- Typecheck terpisah tidak tersedia: proyek JavaScript JSX tidak memiliki skrip typecheck/tsconfig.
- node scripts/verify-frontend.mjs: lulus 35 kombinasi tujuh route pada 320/375/412/768/1440px. Tidak ditemukan overflow, gambar rusak, atau runtime error.
- Browser juga menguji submit POST melalui Supabase SDK asli dengan respons jaringan terisolasi: gagal503, retry payload/request_id identik, receipt, clear draft setelah sukses, salin kode, tracking POST, loading/disabled, published timestamp/permalink, not-found, pembersihan hasil lama, skip link, focus route, kategori, serta isi500/penerima80 karakter tanpa spasi.
- File JSON bukti lengkap: artifacts/visual-audit/verified/report.json. Playwright dipakai dari instalasi pengujian sementara yang sudah tersedia di komputer, tidak ditambahkan ke package.json.
- Build produksi juga dijalankan melalui vite preview dan diperiksa pada24 kombinasi enam route dengan375/412/768/1440px: tidak ada overflow/runtime error. Screenshot dan report berada pada artifacts/visual-audit/production; hasil ini menguji output build lokal, bukan deployment publik.
- Submit dan tracking pada build tanpa env juga diperiksa: error konfigurasi tampil, request_id/draf tetap tersimpan, tanpa runtime error atau request produksi.
- Review independen membaca diff dan source terhubung, tes, serta computed CSS runtime: tidak menemukan blocker baru pada implementasi frontend/dataflow.
- Tidak ada diff pada src/services, src/lib, supabase, package.json, package-lock.json, env, atau konfigurasi auth. Tidak ada perubahan database maupun request ke tabel internal.

## Batas yang belum terselesaikan

Checkout hanya menyediakan submit-menfess dan track-menfess; public-feed/public-menfess masih rancangan. Tidak tersedia API likes atau tanggapan OSIS. Menyelesaikan bagian data ini memerlukan pekerjaan backend terpisah; desain kartu contoh tidak dijadikan konten produksi palsu.

Tidak ada .env aktif pada workspace. Koneksi Supabase produksi, CRUD database produksi, publikasi Instagram, deployment, Safari, dan perangkat fisik belum diuji. Browser API menggunakan domain/kunci dummy hanya pada proses Vite pengujian dan seluruh request diintersep; tidak ada kredensial atau konten pengujian yang ditulis ke environment file/backend.

Teks redup mengikuti warna Figma persis. Kontras beberapa teks kecil masih di bawah WCAG AA (sekitar3,43:1 pada root dan1,9:1 pada panel privasi); penyelarasan AA akan memerlukan warna berbeda dari referensi.

Tidak ada commit/push/deploy otomatis. Branch main, remote origin mengarah ke KiandrAHD/Menfess-Spenthree. Vercel CLI belum terpasang; untuk menjalankan env pull, deployment, dan logs, sangat disarankan memasangnya dengan npm i -g vercel.

## Perintah Git untuk pengguna

Periksa kembali staged diff sebelum commit. Direktori artifacts dan catatan audit Figma sebelumnya tidak disertakan oleh perintah berikut.

```powershell
Set-Location 'D:\menfess'
git add -u -- index.html src
git add -- src/Flows.test.jsx src/components/MessageFormParts.jsx docs/FRONTEND-REPLACEMENT.md docs/FRONTEND-IMPLEMENTATION-PLAN.md scripts/visual-audit.mjs scripts/verify-frontend.mjs
$designAssets = @('arrow.svg','back.svg','brand-circle.svg','caret.svg','check.svg','guide-active.svg','guide.svg','home-active.svg','home.svg','inter-400.ttf','inter-500.ttf','inter-600.ttf','inter-700.ttf','inter-800.ttf','inter-900.ttf','osis.png','plane.svg','school.png','search.svg','security.svg','shield.svg','status-active.svg','status.svg','support.svg','write-active.svg','write.svg')
git add -- ($designAssets | ForEach-Object { Join-Path 'public/design' $_ })
git diff --cached --stat
git commit -m "feat: replace SAGARA frontend with latest Figma design"
git push origin main
```
