# Hasil implementasi filter AI

Tanggal: 22 Oktober 2026. Branch: codex/ai-content-filter. Belum commit, push atau deploy produksi.

## Yang diimplementasikan

- Groq GPT-OSS 120B di server, strict schema dan validasi semantik, timeout/abort 5 detik, gagal tertutup.
- Filter lokal dengan normalisasi pembanding, kata tersamarkan, batas kata dan minimum rules; konteks ambigu diteruskan ke AI.
- Migrasi additive untuk keputusan privat, lease 15 detik, budget atomik, fingerprint, replay receipt dan trigger publikasi.
- Feedback form, draf tetap utuh, ID baru hanya untuk payload berubah; perbaikan tracking yang ditemukan saat audit browser.
- Dataset sintetis 100 tuning/200 evaluasi, evaluator tiga putaran yang dapat dilanjutkan, dan runbook deployment.

## Bukti pengujian

| Pemeriksaan | Hasil |
| --- | --- |
| Unit/integrasi aplikasi | 140 lulus, 10 file |
| Lint dan production build | Lulus |
| Deno typecheck Edge/provider/filter | Lulus |
| Seluruh migrasi dan 3 file SQL | Lulus pada PostgreSQL 18 lokal terpisah |
| Lease dan kuota dua koneksi | Satu permit; request kedua busy/ditolak |
| Receipt ketika commit paralel | 31 pembacaan, hanya missing/replay, tanpa expired palsu |
| Browser filter | 360/1440 px, draf/reject/gagal/retry/koreksi/busy/queued/overflow/runtime lulus |
| Audit interaksi sebelumnya | 97 pemeriksaan lulus, tanpa runtime error |
| Deno + Groq nyata + PostgreSQL lokal | 202 allow, 422 AI/local reject, 409 payload berubah, replay identik; tepat satu pesan/job |
| Pemindaian credential source dan bundle | Tidak ada API key Groq |
| Evaluasi beku saat laporan ditulis | 56/600 keputusan; 50 contoh kritis diperiksa, 0 kritis lolos; belum lulus gate rilis |

Laporan evaluasi terkini ada di artifacts/moderation-evaluation.json; hasil parsial tidak membuktikan akurasi produksi. Run berhenti dengan aman bila provider/kuota tidak tersedia. Evaluasi yang terikat dataset lama disimpan sebagai superseded dan tidak digabungkan.

## Review dan keputusan implementasi

Reviewer menemukan cooldown yang dapat diperpanjang tanpa akhir, snapshot receipt tidak atomik, dan timestamp kuota sebelum lock. Semuanya diperbaiki. Tes regresi cooldown/clock menunjukkan gagal sebelum perbaikan dan lulus sesudahnya; uji dua koneksi membuktikan visibility receipt. Regresi null lease juga gagal sebelum perbaikan dan lulus setelah lease kosong ditolak.

Keputusan eksekusi: gunakan workspace yang sama dengan branch fitur, menjaga file pengguna lain. Pengujian memakai PostgreSQL 18 yang tersedia; Supabase 17 dan scheduler belum diuji langsung. Source migrasi scheduler tidak diubah. StatusPage sebelumnya membatalkan tracking ketika status sementara dibersihkan; tes yang mereproduksi bug gagal lebih dahulu dan kini lulus setelah lifecycle polling/unmount dipisahkan.

Tidak ada implementer subagent; satu reviewer independen meninjau kode. Tidak ada temuan Important yang dibiarkan. Dokumen sekolah, artifacts dan aset tak terkait tidak dimasukkan ke perubahan fitur. Key hanya disimpan di server env lokal yang diabaikan Git.

## Yang belum terverifikasi

- Tiga putaran evaluasi model lengkap belum selesai. Kuota gratis dan gangguan provider menjadi batas nyata; publikasi tetap tertutup.
- Worker Instagram nyata belum ditemukan; assertPublishableModeration harus dihubungkan sebelum render/upload/publish.
- Kelayakan pengelola akun, Zero Data Retention, pemberitahuan/persetujuan dan batas akun aktual belum diverifikasi. Key perlu diganti sebelum produksi karena pernah dibagikan lewat chat.
- Tidak ada pengiriman posting Instagram, deployment atau perubahan database produksi.

Petunjuk konfigurasi dan rilis: [AI-MODERATION.md](AI-MODERATION.md).
