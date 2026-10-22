# Filter AI menfess-spenthree

## Perilaku dan konfigurasi

submit-menfess memeriksa replay receipt, filter lokal, lalu konteks category/recipient/content melalui Groq openai/gpt-oss-120b. Hanya allow dapat membuat pesan dan job melalui RPC atomik yang sudah ada. Reject/uncertain menghasilkan 422 CONTENT_UNSAFE; gangguan model/kuota/config/lease menghasilkan 503 MODERATION_UNAVAILABLE. Draf tetap utuh, retry identik memakai request_id lama, perubahan payload kanonis memakai ID baru. Respons 202 berarti queued, bukan sudah tayang. AI tidak menyensor atau menulis ulang pesan.

Secret/config server memakai supabase/.env.example sebagai template. Nilai lokal disimpan hanya di supabase/.env.local yang diabaikan Git. Jangan menyalinnya ke frontend atau mencetak isinya. Kunci yang pernah dikirim melalui chat harus diganti sebelum produksi. Secret Supabase/HMAC/enkripsi/CORS sebelumnya tetap diperlukan dan tidak diganti.

Wajib: GROQ_API_KEY, MODERATION_MODEL, MODERATION_POLICY_REVISION dan empat MODERATION_ kuota pada template. Konfirmasi batas organisasi di dashboard, termasuk pemakaian aplikasi lain. Angka template mengikuti batas publik, bukan bukti batas akun. Timeout model 5 detik, lease 15 detik, satu panggilan per lease. Kuota request/token atomik lintas instance; byte UTF-8 + framing + maksimum reasoning/output dipakai sebagai reservasi konservatif. Kapasitas nyata dapat lebih rendah dari jumlah request pada dashboard.

Keluaran strict JSON Schema tetap diperiksa semantik: allow harus alasan kosong, reject/uncertain harus kode alasan yang dikenal. Tidak ada tools, penelusuran web, endpoint dari pengunjung, log teks/penerima/tracking/key, atau respons model mentah. HMAC/fingerprint/verdict hanya ada di tabel privat dengan RLS dan akses server.

## Pengujian dan evaluasi

- npm.cmd test; npm.cmd run lint; npm.cmd run build.
- Deno check target: supabase/functions/submit-menfess/index.ts, supabase/functions/_shared/moderation-provider.ts dan supabase/functions/_shared/content-safety.ts. Runtime QA tersedia melalui npm.cmd exec --yes --package=deno@2.7.10 -- deno check diikuti target tersebut; deno.lock merekam dependency.
- Jalankan ketiga file supabase/tests pada database lokal terisolasi. Jangan reset database berisi data nyata. Pemeriksaan lokal menggunakan PostgreSQL 18; target Supabase 17 dan scheduler pg_cron tetap perlu diperiksa saat deployment. Baris scheduler hanya dikecualikan dari input QA lokal, source migrasi dipertahankan.
- Dengan Vite aktif, node scripts/moderation-audit.mjs menguji form pada 360/1440 px melalui transport uji. Playwright memakai PLAYWRIGHT_MODULE atau runtime temporary yang sudah tersedia, tanpa dependency aplikasi baru.
- node --env-file=supabase/.env.local scripts/evaluate-moderation.mjs menjalankan evaluasi provider dengan data sintetis saja. 100 tuning dan 200 evaluation cases terpisah; kasus kritis didahulukan. MODERATION_EVALUATION_MAX_CALLS membatasi panggilan per run, termasuk 0 untuk pemeriksaan offline.

Evaluator menyimpan hasil per kasus/putaran ke artifacts/moderation-evaluation.json tanpa isi pesan dan dapat dilanjutkan dengan perintah yang sama. Hasil terikat hash dataset dan policy; jika berubah, arsipkan laporan lama sebelum menjalankan evaluasi baru. Hasil parsial yang diarsipkan tidak boleh dicampurkan ke versi baru.

Rilis memerlukan tiga putaran lengkap. Pada setiap putaran: nol dari 50 contoh kritis lolos, maksimal lima dari 100 contoh aman salah ditahan, dan maksimal lima dari 100 contoh tidak layak lolos. Uncertain dilaporkan terpisah; gangguan teknis bukan keputusan benar. Run belum lengkap menghasilkan exit 1. Pengujian lengkap dapat membutuhkan beberapa jendela kuota gratis. Jangan menyatakan akurasi produksi berdasarkan smoke test atau hasil parsial.

## Migrasi dan urutan rilis

20261022050000_automated_moderation_gate.sql menambah tabel keputusan/budget/control privat, RPC lease/finalisasi, fingerprint dan trigger gate. Migrasi additive, tanpa menghapus arsip. Isi pesan yang sudah diterima tidak dapat diubah. Arsip published sebelumnya tidak diberi klaim AI-approved retroaktif; antrean lama harus revalidasi sebelum terbit.

moderation_control.active_policy dimulai null dan publishing_enabled dimulai false. Backend service_role hanya dapat membaca control, bukan mengaktifkan publikasi. Konfigurasi gate harus dilakukan operator, bukan pengunjung atau frontend.

Sesudah instruksi deployment, lakukan:

1. Jeda publisher sebenarnya dan ikuti prosedur backup yang sudah ada.
2. Pasang migrasi pada lingkungan uji dan jalankan tes sebelum target yang telah diizinkan. Jangan mengedit migrasi lama.
3. Pasang konfigurasi melalui mekanisme Supabase secrets. Jangan memasukkan key ke argumen commit, screenshot atau berkas tracked.
4. Deploy backend/frontend. Hitung safetyPolicyVersion dari konfigurasi content/recipient, prompt/model/parameter dan MODERATION_POLICY_REVISION yang sama dengan runtime. Operator mengisi hash itu ke moderation_control.active_policy. Jangan menebak hash atau bulk-set approval pesan. Instance dengan kebijakan lama akan ditolak.
5. Buktikan gate kualitas, privasi, kuota dan alur allow/reject/gangguan/retry dengan data sintetis pada sarana uji terpisah.
6. Worker nyata wajib memanggil assertPublishableModeration sebelum render/upload/publish dengan snapshot isi terkunci, policy terkini dan fingerprint cocok. Revalidasi tidak membuat job kedua. Pertahankan idempotensi media Meta dan state machine yang sudah ada.
7. Operator baru boleh mengaktifkan publishing_enabled setelah worker dan evaluasi lengkap terbukti. Rollback menjeda publikasi dan mempertahankan gate; tidak melewati moderasi.

Worker Instagram belum ditemukan dalam repositori saat implementasi ini. Helper dan gate database tersedia, tetapi integrasi eksternal dan auto-publish belum dapat dinyatakan selesai. Tidak ada deployment, commit atau push otomatis pada tugas ini.

Pengelola dewasa/sekolah harus memverifikasi kelayakan akun/model, pemberitahuan/persetujuan yang diperlukan, dan Zero Data Retention sebelum memakai data siswa nyata. Key berfungsi bukan bukti persyaratan tersebut terpenuhi. Tetap gunakan kanal laporan/takedown yang ada; dataset sintetis tidak menjamin semua serangan/bahasa gaul terdeteksi.
