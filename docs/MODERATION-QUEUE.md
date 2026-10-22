# Antrean moderasi tanpa menunggu AI

Pengiriman yang lolos validasi dan filter lokal langsung disimpan privat dan mendapat respons 202 pending_moderation beserta tracking code. Intake tidak memanggil AI, sehingga kuota/model sedang gagal tidak menolak kiriman. Respons tetap menunggu penyimpanan database berhasil; tidak menampilkan sukses palsu jika database gagal atau kapasitas antrean penuh.

Worker process-moderation-queue memakai secret server, lease, kuota atomik dan policy yang sama. Hanya hasil allow yang membuat messages dan publication job secara atomik. Reject/uncertain diblokir; gangguan provider dijadwalkan ulang tanpa menghilangkan kiriman. Teks antrean dihapus setelah allow/blocked; fingerprint/tombstone dan status tetap privat. Receipt retry berlaku 24 jam sejak penerimaan, bukan sejak AI selesai.

Antrean privat maksimal 10.000 kiriman pending untuk membatasi penyimpanan saat spam/provider mati. Tidak ada klaim kapasitas tanpa batas atau angka pesan/menit yang belum diuji. Kuota AI tetap menentukan laju pengosongan antrean. Pesan pending tidak masuk feed/detail atau Instagram.

Deployment memerlukan migrasi 20261022140000_moderation_intake_queue.sql, fungsi submit/track terbaru, process-moderation-queue dan konfigurasi MODERATION_WORKER_SECRET. Jalankan worker melalui scheduler sekali per menit, POST dengan Authorization Bearer secret itu. Maksimal tiga kandidat per invocation; jika kuota habis, worker berhenti dan menjadwalkan retry. Jangan memasukkan secret ke migrasi/cron SQL yang di-commit. Backend produksi belum dipasang tanpa akses deployment yang sesuai.

Ruling: kiriman tetap harus lolos batas panjang, consent, dan filter lokal untuk pelanggaran jelas. Langsung diterima berarti tersimpan privat beserta kode pelacakan, bukan menerbitkan konten sebelum AI. Tidak mengubah gate Instagram atau meloloskan pesan ketika AI gagal.

## Verifikasi lokal — 22 Oktober 2026

- 161 tes pada 13 berkas lulus, termasuk provider gagal/key AI hilang tanpa menghambat intake, antrean penuh, retry, worker allow/reject/uncertain, kuota, lease kedaluwarsa, dan pemeriksaan lokal ulang.
- Seluruh migrasi diterapkan pada database QA kosong PostgreSQL 18 yang terisolasi; lima berkas tes SQL lulus. Pengujian meliputi privasi, receipt 24 jam tanpa perpanjangan setelah approval, replay, stale lease, satu publication job, policy gate, dan konflik request versi lama. pg_cron tidak tersedia di QA ini; baris instalasi scheduler dikecualikan hanya dari input QA, bukan source migrasi.
- Lint, build, Deno check ketiga handler yang berubah, dan git diff --check lulus.
- Browser 360/1440 px dengan transport uji: loading/disabled, penolakan lokal, kegagalan penyimpanan, draf/retry, receipt pending, tidak mengklaim Instagram terbit, tanpa overflow/runtime error. Tidak melakukan unggahan Instagram nyata atau uji kapasitas produksi.
- Belum commit/push/deploy. Target Supabase PostgreSQL 17, secret worker, scheduler, dan alur produksi tetap perlu diverifikasi setelah akses deployment tersedia.
