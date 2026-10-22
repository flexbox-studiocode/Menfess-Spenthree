# Spesifikasi filter AI menfess-spenthree

Tanggal: 22 Oktober 2026. Status: rencana; aplikasi, database, akun layanan, dan publikasi belum diubah.

## Tujuan dan asumsi

Pengguna menginginkan pesan diperiksa otomatis sebelum masuk Instagram, tanpa persetujuan admin rutin. Pesan aman masuk antrean yang sudah ada; pesan melanggar atau meragukan dikembalikan untuk diperbaiki. Model tidak menulis ulang pesan atau otomatis mengganti kata pengirim.

Asumsi perencanaan dari rekomendasi terakhir: gunakan Groq, model openai/gpt-oss-120b, paket gratis. Ini belum merupakan bukti kelayakan akun, kualitas model, atau izin mengirim data siswa. Tidak membuat fallback ke model lain secara diam-diam.

## Dasar layanan

- Groq mencantumkan GPT-OSS 120B sebagai production model. Safeguard 20B masih preview, sehingga hanya kandidat eksperimen terpisah: [daftar model](https://console.groq.com/docs/models).
- GPT-OSS 120B mendukung strict JSON Schema. Bentuk keluaran tetap divalidasi server; kesesuaian schema bukan bukti kebenaran keputusan: [structured outputs](https://console.groq.com/docs/structured-outputs).
- Batas gratis yang dipublikasikan: 30 request/menit, 1.000/hari, 8.000 token/menit, 200.000/hari. Ini batas bersama organisasi dan tidak sama dengan 1.000 pesan yang pasti dapat diperiksa. Batas aktual mengikuti dashboard: [rate limits](https://console.groq.com/docs/rate-limits).
- Groq menyediakan Zero Data Retention untuk data inference terkait reliability/abuse monitoring; metadata penggunaan tetap dikumpulkan: [pengaturan data](https://console.groq.com/docs/your-data).
- Pengguna layanan API harus berusia minimal 18 tahun. Perjanjian juga membahas aplikasi yang diakses anak dengan kewajiban kepatuhan pada pengelola. Sebelum data nyata diproses, pengelola dewasa/pihak sekolah harus bertanggung jawab atas akun, pemberitahuan, persetujuan yang diperlukan, dan ketentuan model: [services agreement](https://console.groq.com/docs/legal/services-agreement).
- Gemini Developer API tidak menjadi fallback untuk website SMP ini karena ketentuan aplikasi dengan pengguna di bawah 18 tahun: [ketentuan Gemini](https://ai.google.dev/gemini-api/terms).

Sumber diperiksa 22 Oktober 2026; periksa ulang sebelum rilis. Jangan meminta API key melalui chat.

## Kondisi source yang diperiksa

- React/Vite dan Supabase Edge Functions dipertahankan. Tidak perlu library AI baru; fetch, AbortController, dan crypto bawaan mencukupi.
- submit-menfess memvalidasi body lima field, kategori, rules_accepted, content 10–500 dan recipient 1–80 Unicode code point. Normalisasi kontrak menggunakan NFC.
- content-safety.ts memeriksa kontak, URL/handle, serta substring istilah. Konfigurasi env sekarang dapat mengganti daftar bawaan; perbaiki agar aturan minimum tidak hilang.
- submit_menfess_atomic membuat message, receipt terenkripsi, dan job dari trigger dalam satu transaksi. Jangan menambahkan job kedua di Edge Function.
- Retry menggunakan request_id, payload HMAC, receipt maksimal 24 jam, dan tombstone request permanen selama pesan ada.
- Public feed menampilkan pesan yang sudah lolos filter lama pada beberapa status, termasuk queued. Jangan menampilkan klaim telah tayang di Instagram sebelum published.
- Belum ditemukan worker/render/publisher Instagram di folder fungsi repositori. Lokasi dan implementasi sebenarnya harus diverifikasi sebelum menjanjikan auto-publish.

## Alur wajib

Validasi request → cari hasil request yang sudah diterima → filter lokal → reservasi keputusan/kuota → Groq → simpan keputusan → RPC atomik → feed/tracking yang sudah ada → verifikasi ulang sebelum publikasi Instagram.

Replay yang sudah diterima diperiksa sebelum menjalankan kebijakan/model terbaru, agar respons hilang tidak menyebabkan keputusan acak atau job ganda. Worker tetap menerapkan kebijakan publikasi terkini.

| Hasil | Respons | Perilaku |
| --- | --- | --- |
| Lolos lokal dan AI | 202 queued | Buat pesan/receipt/job sekali; belum berarti tayang |
| Melanggar atau konteks meragukan | 422 CONTENT_UNSAFE | Tidak membuat pesan/receipt/job; draf dapat diperbaiki |
| AI gagal, kuota habis, hasil rusak | 503 MODERATION_UNAVAILABLE | Tidak membuat pesan/job; retry manual dengan ID/payload sama |
| Request identik sedang diperiksa | 503 MODERATION_UNAVAILABLE | Retry-After 15 detik; tidak memanggil model kedua |
| ID sama, payload berbeda | 409 IDEMPOTENCY_CONFLICT | Tidak mengganti isi atau keputusan request lama |
| Replay diterima / receipt kedaluwarsa | Receipt lama / 409 RECEIPT_EXPIRED | Pertahankan kontrak dan tombstone yang sudah ada |

## Kebijakan isi

Periksa category, recipient, dan content bersama-sama. Tolak penghinaan/perundungan, ancaman, ujaran kebencian, pelecehan/konten seksual, data pribadi, promosi spam, dan pengungkapan identitas yang mempermalukan orang lain. Nama biasa pada recipient tidak otomatis ditolak; konteks penargetan/identifikasi yang berbahaya tetap diblokir.

Kritik sopan, apresiasi, istilah ambigu, serta pembahasan edukatif bukan pelanggaran hanya karena mengandung potongan kata. Curhat kesulitan emosional tidak disamakan dengan ajakan menyakiti diri. Konten krisis atau detail pribadi yang tidak layak disiarkan tetap tidak diterbitkan; UI memberi tanggapan empatik tanpa diagnosis atau nomor bantuan yang belum diverifikasi.

Normalisasi tambahan hanya pada salinan pembanding: kompatibilitas Unicode, huruf kecil, zero-width, variasi angka/huruf yang dikenal, pengulangan dan pemisah. Jangan menggabungkan seluruh kalimat atau menghapus aksara sah. Isi tersimpan tetap memakai kontrak NFC asli.

Keluaran model hanya decision allow/reject/uncertain dan reasons dari enum: profanity, harassment, hate, threat, sexual, personal_data, spam, sensitive_context. Allow wajib memiliki reasons kosong; reject/uncertain wajib memiliki alasan. Tidak memakai angka confidence sebagai jaminan keselamatan, kutipan pesan, penjelasan bebas, atau chain-of-thought.

## Integritas, biaya, privasi

- Server memegang API key di Supabase secrets; tidak ada VITE_GROQ_API_KEY atau panggilan Groq dari browser. Gunakan satu endpoint tetap https://api.groq.com/openai/v1/chat/completions, tanpa tools, browsing, atau URL dari request.
- Satu panggilan model per lease, timeout 5 detik, reasoning_effort low dan max_completion_tokens 1024 sebagai nilai awal yang harus lolos evaluasi. Output terpotong/refusal dianggap kegagalan, bukan allow.
- Reservasi keputusan atomik memakai request_id, payload HMAC, versi kebijakan, serta lease 15 detik. Pemilik lease lama tidak dapat menulis setelah lease diambil alih. Hasil gagal teknis tidak menjadi penolakan permanen; lease dilepas dan retry boleh memeriksa ulang setelah cooldown.
- Keputusan allow/reject/uncertain yang valid dapat digunakan ulang untuk payload dan kebijakan sama. Versi berubah membutuhkan evaluasi baru untuk request yang belum diterima. Kebijakan/hasil klien tidak dipercaya.
- Approval mengikat fingerprint SHA-256 category/recipient/content dan versi filter, prompt, model serta parameter. Worker memeriksa ulang sebelum upload/publish; status queued saja tidak cukup.
- Hitung kuota request dan token lintas instance secara atomik, bukan Map dalam proses. Gunakan batas aktual akun dan reservasi konservatif input + maksimum output, termasuk reasoning. Panggilan gagal yang mungkin diproses tetap dihitung konservatif; cache/replay tidak memakan kuota baru. Saat anggaran tidak cukup, kembalikan 503 dan jangan menunggu lama di request.
- Log hanya ID teknis, versi, kode hasil, latensi, jumlah token dan error aman. Tidak mencatat pesan, recipient, tracking code, API key, prompt berisi data siswa, atau respons mentah.
- Jangan menghapus arsip/pesan lama atau menganggap semua approval lama setara pemeriksaan AI. Pesan lama yang sudah published dan terlihat tetap menjadi arsip dengan kebijakan sebelumnya; antrean lama perlu revalidasi sebelum terbit. Tidak menambahkan label AI-approved untuk arsip lama.
- Tidak ada cleanup otomatis baru pada tahap ini. Tabel keputusan tidak menyimpan teks dan hanya diakses server; retensi/tombstone mengikuti kebutuhan replay dan bukti job sampai kebijakan pemeliharaan ditetapkan.

## Kriteria penerimaan

Siapkan 100 contoh tuning terpisah dan 200 contoh evaluasi sintetis yang dibekukan: 100 aman, 100 tidak layak, dengan 50 contoh kritis di dalam kelompok tidak layak. Cakup bahasa Indonesia/Jawa, typo, slang, emoji, Unicode, penargetan melalui recipient, data kontak dan prompt injection.

Jalankan evaluasi beku tiga kali dengan konfigurasi sama. Setiap putaran harus memblokir seluruh 50 contoh kritis, salah menolak paling banyak 5 dari 100 contoh aman, dan meloloskan paling banyak 5 dari 100 contoh tidak layak. Laporkan uncertain, false positive, false negative, latensi dan pemakaian token terpisah; hasil tidak membuktikan akurasi universal. Jika gagal, jangan aktifkan auto-publish.

Unit, integrasi, SQL race/RLS, browser mobile 360 px dan desktop 1440 px harus membuktikan: tidak ada job untuk reject/uncertain/provider gagal, maksimal satu job per request, draf tidak hilang, serta perubahan payload memakai request_id baru. Gangguan model tidak boleh melewati gate.

## Batas lingkup dan rilis

Tidak menambah panel approval rutin, provider framework, sensor otomatis, layanan berbayar, backend pengganti, desain baru, atau fitur upload media. Migrasi hanya additive untuk metadata/RPC internal; kontrak submit publik, auth dan sumber data dipertahankan.

Filter dapat dikembangkan dan diuji lokal dengan respons provider terisolasi. Data siswa nyata menunggu kelayakan akun/privasi dan evaluasi. Auto-publish menunggu worker Instagram yang nyata lulus gate dan uji ujung ke ujung; tidak membangun worker palsu untuk menutup kekurangan tersebut. Deployment dan Git mengikuti instruksi pengguna tersendiri.

