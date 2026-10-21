# Audit Figma — Status, Panduan, Review, Detail

Audit 21 Oktober 2026. **Spesifikasi desain, bukan implementasi.** Source aplikasi/services/CSS tidak diubah. Skill `figma-design-to-code` dimuat sebelum empat `get_design_context`, masing-masing `forceCode: true` dan screenshot disertakan. Schema tool runtime tidak menyediakan parameter `skillNames`. Respons penuh/high-fidelity; child context tidak diperlukan. Metadata Panduan dipakai sebagai pemeriksaan geometri. Belum ada audit browser/runtime atau pembandingan pixel aplikasi.

## 1. Target dan batas pekerjaan

| Layar | Node | Nama aktual | Screenshot |
|---|---|---|---|
| Status | `59:937` | Status | 412 × 789 px |
| Panduan | `59:995` | Panduan | 412 × 932 px |
| Review | `59:1047` | Home (nama usang) | 412 × 862 px |
| Detail | `59:1138` | Status (nama usang) | 412 × 568 px |

Potensi implementasi hanya `src/pages/StatusPage.jsx`, `GuidePage.jsx`, `ReviewPage.jsx`, `DetailPage.jsx`, dan CSS baru terisolasi untuk halaman tersebut. Jangan mengubah `Page.jsx`, shared CSS, atau services. Header/navbar adalah konteks screenshot, bukan izin mengubah shell. Jangan menggandakannya bila runtime shell sudah menyediakan. Tunggu audit runtime sebelum menetapkan penanganan shell.

Stack: React 19 JSX, React Router 7, Vite, CSS Modules; `lucide-react` tersedia, tidak ada Tailwind/UI library. Font global masih system-ui. Shared `Page` memberi eyebrow dan h1 32–56 px; root berlatar terang. Konflik visual ini di luar izin modifikasi shared; wrapper dan CSS lokal baru dapat dipertimbangkan. Tidak ada bukti file font Inter dalam hasil penelusuran aset publik.

## 2. Token aktual Figma

Semua ukuran px; nilai dari layer/code, bukan estimasi screenshot. Seluruh teks menggunakan **Inter** dan `line-height: normal`; tool tidak memberi angka line-height. Tinggi text box bukan line-height.

| Peran | Nilai |
|---|---|
| Frame | `#181D27` |
| Header/input/kartu/navbar/tombol sekunder | `#222936` |
| Border standar | `1px solid #394253` |
| Aksen tombol/progress/garis respons | `#343782` |
| Panel bantuan/respons | `#2B354A` |
| Panel anonim Review | `#343D4E` |
| Border tombol sekunder Review | `#343D4D` |
| Teks utama | `#FFFFFF` |
| Teks redup | `#667185` atau `rgba(102,113,133,0.8)` |
| Nav/label sekunder | `#9A9CC6` |
| Nav aktif Status/Panduan | `#6D71D2` |
| Link Status | `#7F83E8`, underline |
| Badge aspirasi | latar `#2B354A`, teks `#B8C4FF` |
| Badge menfess Review | latar `rgba(74,99,151,0.5)`, teks `#9A9CC6` |
| Ditanggapi | `#9BD1B5` |
| Radius kartu/input/tombol/bantuan | 10 |
| Radius badge | 3 |
| Header shadow | `0 0 4px rgba(0,0,0,0.25)` |
| Navbar border | `0.3px solid #FFFFFF` |

Notasi tipografi berikut `ukuran/weight`; tracking dalam px. Hierarki: title24/900; pesan13/500 tracking.65; tombol14/800 tracking.7; subtitle/breadcrumb10/600; heading panduan15/600.

### Shell berulang (konteks, di luar scope)

Header x0 y0 412×64. Logo OSIS x18 y15 35×35; crop gambar width126.22%, left−17.9%; lingkaran x19 y15 34×34. Logo sekolah x359 y16 32×32 r600; crop width112.82%, height114.9%, left−9.57%, top−8.46%; lingkaran x358 y15 34×34. Akun `spenthreeskj_fess` x58 y14 14/600 putih; sekolah x59 y34 10/600 tracking.5 redup. Back12×12 x17 y76; label x34 y76 10/600 redup. Title umum x19 y102 24/900; subtitle x19 y133 10/600 redup. Gutter19–20, lebar kartu373.

Navbar y723 Status, y866 Panduan, y796 Review, y501 Detail; h67 w415 x−1 (Detail x−4). Ikon umum24×24 pada nav+16, label10/600 tracking.5 pada nav+43. Screenshot tidak membuktikan breakpoint atau fixed/sticky. Jangan hardcode overflow negatif.

## 3. Status — `59:937`

Title `Status pesan`; subtitle `cek apakah menfess kamu sudah di tinjau dan diterbitkan`; back `Beranda`.

| Elemen/node | Geometri | Tipografi |
|---|---|---|
| Label `59:947` | x19 y164 w191 h23 | 14/700 putih |
| Input `59:948/949`, duplikat | x20 y189 373×40 | surface/border/r10 |
| Placeholder `59:958` | x35 y200 | 14/500 tracking.7 redup80% |
| Tombol `59:951/963` | x19 y247 373×50 | aksen/r10; teks x140 y261 14/800 tracking.7 |
| Search `59:986` | x254 y262 14×14 | SVG |
| Link `59:983` | x20 y315 | 10/300 tracking.5 ungu underline |
| Result `59:950` | x20 y353 373×314 | surface/border/r10 |
| Kode `59:959` | x35 y369 | 11/500 tracking.55 redup80% |
| Recipient `59:952` | x35 y395 | 13/700 putih |
| Timeline titles | x78 y435/495/555 | 11/700 putih |
| Timeline descriptions | x82 y455/515/575 | 8/700 tracking.4 redup80% |
| Spine `59:990`, dots `991–993` | x48 y435.99 tinggi126.016; dots x45 y439/499/559 7×7 | SVG |
| CTA tanggapan | x50 y606 312×40; teks y616 | surface/border/r10; 13/700 center |

Jarak: input ke tombol18; tombol ke link18; link box9 ke card29; card padding kiri15; timeline pitch60; CTA inset30. Copy: `Kode pelacakan`, `Contoh: SPT-024`, `Periksa status`, `Lihat contoh aspirasi yang ditanggapi OSIS`, `SPT-024`, `Untuk: OSIS Spenthree`, `Baca Tanggapan OSIS`. Timeline: `Pesan diterima` / `Menfess telah masuk ke antrean moderator.`; `Pesan diterbitkan` / `Pesan telah melewati tinjauan moderator.`; `Ditanggapi OSIS` / `Tanggapan dapat dibaca pada detail pesan.`

**Adaptasi produk:** result hanya setelah submit/lookup, bukan fixture selalu tampil. Pakai status otomatis asli, pesan backend aman, waktu/permalink bila tersedia. Jangan mengarang tahap moderator, Ditanggapi, recipient, atau link detail dari tracking code. Pertahankan loading/error/empty/copy kode. `SPT-024` bukan format produksi yang boleh diasumsikan.

## 4. Panduan — `59:995`

Title `Panduan menfess`; subtitle `Bebas bercerita, tetap saling menghargai.`

| Elemen/node | Geometri | Tipografi |
|---|---|---|
| About `59:1013` | x20 y173 373×120 | surface/border/r10 |
| About label `1015` | x35 y189 | 13/600 tracking.65 redup80% |
| About body `1014` | x35 y220 w333 h73 | 12/600 putih |
| Rule headings `1009–1012` | x19/20/21/22 y328/430/526/622 | 15/600 putih |
| Rule bodies `1002–1005` | x27/28/29/30 y354/456/552/648 w377 | 12/500 redup |
| Support `1039` | x22 y730 373×81 | #2B354A/r10 |
| Support icon `1042` | x32 y741 22×22 | SVG |
| Support title/body | x61 y740 / y766 w305 h30 | 15/600 putih; 11/500 redup |

About label typo aktual `TENTANG SPENTRHEE SKJ_FESS`. Body: `Menfess warga SMP Negeri 3 Sokaraja untuk titip pesan anonim, curhat, dan saling memberi apresiasi. Aspirasi ke OSIS tersedia sebagai salah satu kategori.`

1. `Boleh cerita, tapi jaga perasaan` — `Kirim cerita, titip pesan, atau apresiasi dengan sopan. Hindari ejekan, rumor, dan pesan yang mempermalukan orang lain.`
2. `Jaga informasi pribadi` — `Jangan mencantumkan nama lengkap, nomor telepon, alamat, atau informasi pribadi orang lain.`
3. `Tunggu prosespeninjauan` (typo aktual) — `Moderator meninjau pesan sebelum tayang. Pesan yang tidak sesuai panduan dapat tidak diterbitkan.`
4. `Simpan kode pelacakan` — `Gunakan kode untuk melihat apakah menfess sudah tayang. Khusus aspirasi, kamu juga bisa membaca tanggapan OSIS.`

Screenshot memiliki separator sekitar y405/507/603/699, tetapi code/context dan metadata tidak mengeluarkan layer garis; warna/ketebalan **belum terukur**, jangan menyatakannya sebagai spesifikasi pasti. Jarak about bottom293 ke rule1=35; heading ke body26; heading pitch102/96/96. Support: `perlu pendampingan pribadi?` / `Untuk perundungan atau masalah sensitif, hubungi guru BK atau wali kelas secara langsung.`

**Adaptasi produk:** rule3 menjelaskan validasi/publikasi otomatis, rule4 tanpa janji tanggapan OSIS. Aspirasi tetap kategori, bukan inbox/tanggapan OSIS. Pertahankan kejujuran privasi: anonim ke pengunjung bukan janji tanpa metadata teknis. Koreksi typo copy.

## 5. Review — `59:1047`

Back `Ubah pesan`; title `Periksa pesan`; subtitle `Pastikan isi pesan sudah sesuai sebelum dikirim.`

| Elemen/node | Geometri | Tipografi |
|---|---|---|
| Step labels | x16/338 y167 | 10/600 tracking.5 redup |
| Progress `1059/1060` | x98/221 y172 114×4 | aksen/r100 |
| Preview `1061` | x20 y202 373×122 | surface/border/r10 |
| Anonim `1091` | x35 y218 | 10/600 redup |
| Badge `1101/1102` | x331 y217 47×18; teks x337 y221 | 8/600 tracking.4 |
| Recipient `1063` | x35 y250 | 15/700 putih |
| Content `1064` | x36 y284 w359 | 13/500 tracking.65 putih |
| Security `1105` | x19 y342 29×22 | SVG |
| Queue note `1103` | x43 y344 w352 | 10/600 tracking.5 redup |
| Send `1108/1109` | x19 y386 373×50; teks y400 | aksen/r10;14/800 tracking.7 |
| Plane `1112` | x253 y400 20×20 | SVG |
| Edit `1110/1111` | x19 y449 373×50; teks y463 | surface/border #343D4D/r10;14/800 tracking.7 |
| Prototype note `1104` | x68 y511 | 10/600 tracking.5 redup |
| Anonymity `1062` | x20 y600 373×85 | #343D4E/border/r10 |
| Shield `1095` | x40 y613 36×36 | SVG |
| Anonymity title/body | x85 y612 / y640 w283 | 14/600 tracking.7 putih;11/500 tracking.55 redup80% |
| Checkbox `1114` | x37 y702 36×36 | checked SVG |
| Agreement `1066` | x85 y710 w317 | 12/500 tracking.6 putih80% |

Step gap9; preview top setelah step≈26; preview bottom324 ke security342=18; send ke edit13. Preview recipient/category/content harus dari draft, bukan contoh `Hai ganteng kenalin aku Rainer salam kenal yah`. Anonymity title `Diterbitkan sebagai Anonim`; body `Nama tidak ditampilkan kepada siswa lain. Isi pesan akan dibaca oleh moderator OSIS`. Agreement `Saya memastikan pesan tidak berisi hinaan, data pribadi, atau informasi yang mempermalukan orang lain.`

**Artefak:** orphan `Minimal 10 karakter` x23 y559, `25/500` x349 y559 dan resize grip x378–387 y533–542 tanpa textarea; jangan hardcode angka/editor palsu. Ada dua navbar: yang terlihat y796, lainnya y862 dan item y878–905 di luar frame; jangan meniru duplikat. `Simulasi Prototipe Tidak dikirim ke sekolah` salah untuk submit nyata. Queue note `Pesan masuk ke antrean tinjauan OSIS, Pesan belum langsung tampil di beranda` dan body moderator wajib diselaraskan ke proses otomatis. Checkbox bila tampil harus kontrol interaktif, bukan SVG semata; draft sudah membawa `rules_accepted`. Pertahankan missing draft, loading/disabled/error, request_id tetap pada retry, dan clearDraft hanya sesudah sukses.

## 6. Detail — `59:1138`

| Elemen/node | Geometri | Tipografi |
|---|---|---|
| Code `1147` | x23 y105 | 10/600 redup |
| Badge `1139/1148` | x337 y104 56×16; teks x346 y105 | 10/600 #B8C4FF |
| Recipient `1150` | x19 y127 | 24/900 putih |
| Dari Anonim `1145` | x19 y164 | 10/600 redup |
| Message `1152` | x20 y193 373×92 | surface/border/r10 |
| Message body `1155` | x35 y204 w259 | 13/500 tracking.65 putih |
| Response `1153` | x20 y298 373×146 | #2B354A; radius tidak dilaporkan |
| Accent `1154` | x20 y298 3×146 | #343782 |
| Response heading `1157` | x35 y310 | 13/700 tracking.65 putih |
| Response body `1156` | x35 y336 w259 h69 | 13/500 tracking.65 putih |
| Ditanggapi `1164` | x328 y305 | 10/400 #9BD1B5; check-circle dekat x312 |
| Example note `1160` | x35 y410 | 10/600 redup |

Duplikat card `1151` h40 berada di bawah card92; satu card cukup. Padding kiri15; gap message–response13. Copy: `SPT-024`, `Aspirasi`, `Untuk: OSIS Spenthree`, `Dari Anonim`, `Tanggapan OSIS`, `Contoh tanggapan untuk presentasi`. Message contoh sama dengan Review, tetapi jawaban membahas pojok baca: fixture tidak konsisten. Respons `Terimakasih atas usulannya, Kami akan menyampaikan ide pojok baca kepada pembina dan membahas lokasi serta kebutuhan bukunya.` Screenshot memuat `Menfess` kecil di atas header yang tidak ada dalam context node; jangan direka sebagai elemen halaman.

**Adaptasi produk:** kontrak tidak punya tanggapan OSIS/answered state; jangan render sebagai data nyata. Jangan tampilkan tracking code pada detail publik. URL memakai public_id acak, bukan tracking/ID internal. Halaman source masih placeholder dan wrapper service detail belum tersedia. Dengan larangan mengubah services, fallback jujur lebih aman daripada fixture palsu; penyambungan data menunggu keputusan parent/runtime.

## 7. Kontrak dan perilaku yang wajib dipertahankan

- `services/index.js` hanya menyediakan submit, tracking, helper draft/sessionStorage/request ID. Tidak ada service feed/detail/response/likes. Timeout submit20s, tracking15s; payload max16KiB; error backend aman.
- Review membaca draft sekali, menyimpan request_id sebelum submit; pada error draft tetap; sukses clearDraft lalu navigate `/status` via location.state, bukan query. Jangan merusak idempotensi.
- Status menerima submit result melalui location.state; tracking POST `{tracking_code}`; error/loading, copy kode bila tersedia, waktu terbit dan Instagram harus tetap berfungsi.
- Tracking hanya `status`, `message`, `published_at`, `ig_permalink`; tidak mengembalikan content, recipient, public_id, atau tanggapan. Status dan label aman: queued/Diterima; processing/Sedang diproses; publishing/Sedang dipublikasikan; published/Berhasil dipublikasikan; retry_scheduled/Sedang mengalami kendala; failed/Mengalami kendala; blocked/Tidak dapat diproses. Frontend tidak menentukan transisi atau menjanjikan waktu tayang.
- Kontrak detail GET `public-menfess?id=<public_id UUID>` menghasilkan `{data:{public_id,category,recipient,content,published_at,ig_permalink}}`, hanya published; 404 seragam untuk tidak ada/belum terbit. Dokumen kontrak berstatus rancangan; audit runtime parent menentukan ketersediaan nyata.
- **Tidak moderator:** Review source eksplisit tidak ada persetujuan manual. Validasi/publikasi otomatis, bukan antrean moderator.
- **OSIS:** aspirasi adalah kategori; tidak ada kontrak inbox, review staf, tanggapan atau status Ditanggapi. Jangan menyajikan fixture OSIS sebagai fitur.
- **Likes:** tidak terlihat di empat screenshot, tidak ada dalam source/service. API eksplisit menunda likes P1. Jangan menambah tombol/count/field/optimistic likes.

## 8. Aset dan verifikasi berikutnya

Figma: PNG sekolah/OSIS; SVG brand/back/home/write/status/guide; Status search/spine/dots; Panduan contact; Review security/shield/plane/checkbox; Detail check-circle. URL `http://localhost:3845/assets/…` sementara, bukan URL source produksi. Aset publik yang ditemukan: `public/design/{school.png,osis.png,brand-circle.svg,back.svg,home.svg,write.svg,status.svg,guide.svg,contact.svg,security.svg,shield.svg,check.svg}` dan lainnya. Nama file tidak membuktikan kecocokan; cocokkan export/hash, dimensi root SVG, slot dan crop sebelum reuse. Jangan mengganti aset dengan emoji/ikon generik tanpa exact match. Audit ini tidak mengunduh/mengubah aset.

Setelah runtime tersedia: verifikasi viewport412 tiap route, font Inter/line-height efektif/wrapping, padding lokal versus shell, aset+crop, keyboard/focus, loading/error/empty/missing draft, retry idempotensi, status aman, link Instagram, privasi kode, dan absennya moderator/OSIS-response/likes fiktif. Tinggi frame berbeda bukan alasan layout absolut penuh. Catat mismatch shell di luar scope; jangan memperbaikinya melalui shared CSS. Belum ada implementasi atau klaim pixel-match.

## Referensi yang dibaca

`src/pages/{StatusPage,GuidePage,ReviewPage,DetailPage,Page}.jsx`, `src/pages/Page.module.css`, `src/services/index.js`, `src/App.module.css`, `src/components/AppLayout.module.css`, `package.json`, `docs/API-CONTRACT.md`. Aset publik baru ditemukan lewat glob, identitas belum diverifikasi.

Sumber desain: empat node Figma di atas melalui get_design_context beserta screenshot, dan metadata Panduan. Tidak ada perubahan halaman, shared CSS, Page, services, atau aset dalam audit ini.
