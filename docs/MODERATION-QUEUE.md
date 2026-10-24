# Antrean moderasi dan publikasi Instagram

## Kontrak

Submit baru lolos validasi, consent, dan filter lokal; transaksi direct menyimpan pesan, receipt, satu publication job, dan satu tugas `message_moderation_jobs`. Pesan terlihat di website sebelum AI selesai. `queued` berarti antrean Instagram, bukan konfirmasi terbit. Jika transaksi/kapasitas antrean gagal, respons tidak boleh sukses dan draf dipertahankan.

Worker `process-moderation-queue` memproses maksimal tiga kandidat per invocation, bergantian antara tugas pesan existing dan `moderation_intake` privat lama. Kedua sumber memakai policy, quota request/token, fingerprint, cached decision, dan lease yang sama. Tugas existing tidak menginsert pesan atau publication job kedua.

- `allow`: Instagram eligible hanya jika policy aktif/fingerprint cocok dan gate operator terbuka.
- `reject`, `uncertain`, atau gagal pemeriksaan lokal ulang: website disembunyikan dan Instagram diblokir.
- Provider/kuota bermasalah: tugas ditunda; tidak mengubah gangguan menjadi approval.
- Intake lama tetap privat sampai allow. Receipt/tombstone lama tidak dibuat ulang atau diperpanjang.

Visibilitas website (`web_status`, `web_published_at`), keputusan AI (`moderation_decisions`), dan delivery Instagram (`messages.status`, `published_at`, `ig_media_id`) terpisah. Pesan hidden tidak tersedia di timeline/detail/likes/leaderboard. Tidak ada jaminan konten website seluruhnya sudah diperiksa AI sebelum tampil.

## Deployment

1. Jeda publisher dan scheduler publikasi; tunggu invocation lama selesai. Catat job ambigu untuk rekonsiliasi, jangan reset lease hidup.
2. Terapkan seluruh migrasi termasuk perbaikan dual-pipeline pada DB pengujian PostgreSQL 17 terlebih dahulu. Jangan edit migrasi lama atau reset DB berisi data nyata.
3. Pasang konfigurasi AI, secret worker dan credential renderer/Meta melalui secret manager. Hitung `active_policy` dari konfigurasi runtime yang sama; jangan gunakan marker policy lokal sebagai hash AI.
4. Deploy worker moderasi, publisher, submit/tracking, dan frontend yang kompatibel.
5. Konfigurasikan scheduler menurut [K06-PUBLICATION.md](K06-PUBLICATION.md). Periksa hasil eksekusi nyata, bukan hanya keberadaan cron job.
6. Backfill melalui `enqueue_message_moderation_backfill(100)` dalam batch kecil. Backfill berulang tidak mereset verdict, lease, receipt, job terminal, atau job ambigu. Tidak otomatis mengaktifkan legacy job AI dengan `eligible_at IS NULL`. Untuk policy berubah, DB owner dapat memanggil `requeue_message_moderation(message_id,active_policy)` secara selektif; RPC menolak lease aktif, job ambigu/terminal/confirmed, dan tidak membuka kembali visibilitas pesan hidden. Jangan reset semua verdict lewat SQL massal.
7. Uji allow/reject/uncertain/provider gagal, policy berubah, replay, expiry, dan concurrency. Evaluasi kualitas AI tetap diperlukan sebelum pemakaian data siswa.
8. Uji satu publikasi sintetis berizin pada akun uji. Buktikan media ID/permalink sebelum membuka antrean lain.

Rollback menutup gate dan scheduler Instagram tanpa menghapus data/antrean atau melepas AI gate. Pengiriman ke Groq melibatkan provider eksternal; verifikasi persetujuan, retensi, dan kelayakan pemrosesan data sebelum produksi.

## Pengujian

Verifikasi implementasi lokal 24 Oktober 2026: 222 tes JavaScript pada 16 berkas, lint, production build, renderer, serta Deno check keenam handler lulus. Seluruh migrasi dan sembilan berkas tes SQL lulus pada PostgreSQL 18 terisolasi; cron, Vault, pg_net, dan storage menggunakan stub QA. Ini bukan bukti extension/scheduler Supabase asli berjalan dan bukan uji publikasi Meta. Target PostgreSQL 17, secret, policy, token, evaluasi AI, dan smoke test produksi masih wajib diverifikasi.

Tes worker mock tidak membuktikan kompatibilitas migrasi SQL. Jalankan semua migration dan `supabase/tests` pada DB terisolasi, termasuk fixture direct-local dan intake AI lama. Jangan menyatakan siap produksi sampai scheduler, token, deployment dan smoke test Instagram diverifikasi.
