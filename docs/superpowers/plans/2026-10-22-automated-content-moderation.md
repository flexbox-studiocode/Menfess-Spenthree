# Filter AI menfess-spenthree — Implementation Plan

> For agentic workers: gunakan superpowers:executing-plans untuk implementasi berurutan. Checklist di bawah melacak pekerjaan yang belum dikerjakan. Review spesifikasi terlebih dahulu.

Goal: hanya pesan yang lolos filter lokal dan pemeriksaan konteks Groq yang masuk antrean publikasi, tanpa approval admin rutin.

Architecture: perluas submit-menfess dan RPC yang sudah ada. Moderasi terjadi di server sebelum pesan/job dibuat; reservasi keputusan melindungi request paralel dan retry. Worker Instagram wajib mengecek approval yang terikat isi dan kebijakan sebelum menerbitkan.

Tech Stack: React 19/Vite 7, Supabase Edge Functions/Deno TypeScript, PostgreSQL 17, Vitest; fetch, AbortController dan crypto bawaan tanpa SDK baru.

Spec: ../specs/2026-10-22-automated-content-moderation.md.

## Global constraints

- Tidak ada approval admin rutin dan tidak ada bypass jika layanan moderasi gagal.
- Pertahankan body submit lima field, kategori, NFC, content 10–500/recipient 1–80 code point, rules_accepted, auth, sumber feed, draf, tracking, receipt 24 jam, dan tombstone.
- Asumsi rencana: Groq openai/gpt-oss-120b melalui endpoint tetap, paket gratis; tidak mengganti provider/model tanpa evaluasi dan keputusan eksplisit.
- Keputusan hanya di server; tidak ada API key di VITE_ env, bundle, request browser, fixture, log, atau Git.
- Migrasi additive untuk metadata/RPC internal; tidak mengedit migrasi lama, menghapus arsip, atau bulk-set approval.
- Jangan memublikasikan fixture/smoke test ke Instagram produksi.
- Pengembangan lokal tidak memerlukan akun produksi. Data siswa nyata dan auto-publish menunggu seluruh gate rilis.
- Rencana ini tidak mengizinkan instalasi layanan berbayar, deployment, commit atau push.

## Review focus

- Kata ambigu, aksara Unicode, recipient biasa dan curhat emosional tidak boleh ditolak hanya karena substring; tes tahap 1–2.
- Response 202 hilang, receipt purge, policy berubah dan request serentak tetap menghasilkan maksimal satu job; tes tahap 3–4.
- Prompt injection, refusal, JSON valid tetapi makna inkonsisten, timeout dan kuota token habis tidak menghasilkan allow; tes tahap 4.
- Edit draf setelah kegagalan memisahkan payload baru dari retry payload lama tanpa kehilangan teks; tes tahap 5.
- Isi/approval berubah antara antrean dan publish, serta pesan legacy, tidak memakai approval usang; tes tahap 6.

## Peta file

| File | Tanggung jawab |
| --- | --- |
| supabase/functions/_shared/content-safety.ts | Filter lokal, normalisasi pembanding, fingerprint dan policy hash |
| supabase/functions/_shared/moderation-policy.ts | Jenis input/hasil, enum alasan, aturan dan prompt tetap |
| supabase/functions/_shared/moderation-provider.ts | Konfigurasi server dan satu panggilan Groq tervalidasi |
| supabase/functions/submit-menfess/index.ts | Replay, reservasi, moderasi, finalisasi dan submit |
| supabase/migrations/20261022050000_automated_moderation_gate.sql | Keputusan privat, kuota atomik, gate RPC |
| supabase/tests/moderation_gate.sql | RLS, gate, lease, kuota dan idempotensi |
| supabase/tests/submit_receipt_regression.sql | Sesuaikan fixture RPC tanpa menghilangkan regresi lama |
| src/test/content-safety.test.js, src/test/moderation-provider.test.js, src/test/edge-handlers.test.js | Tes filter, transport dan handler |
| src/services/index.js, src/services/index.test.js | Error publik |
| src/pages/WritePage.jsx, src/pages/ReviewPage.jsx, src/Flows.test.jsx | Draf, retry, dan feedback |
| src/test/fixtures/moderation-tuning.json, src/test/fixtures/moderation-evaluation.json | Dataset sintetis terpisah |
| scripts/evaluate-moderation.mjs | Evaluasi offline terhadap provider dengan data sintetis |
| supabase/.env.example | Nama konfigurasi server tanpa credential asli |
| docs/CONTENT-SAFETY.md, docs/API-CONTRACT.md, docs/K04-DEPLOYMENT.md | Kontrak, konfigurasi dan runbook setelah implementasi |

Konfirmasi timestamp migrasi dan lokasi worker saat mulai; jika timestamp sudah terpakai, gunakan timestamp berikutnya. Jangan membuat worker Instagram pengganti di tugas filter.

## Tahap 1 — Kebijakan dan tolok ukur

Files: moderation-policy.ts, fixture tuning/evaluation, content-safety.test.js, dokumen keselamatan.

Interfaces:

- ModerationInput = { category: string; recipient: string | null; content: string }.
- Reason = profanity | harassment | hate | threat | sexual | personal_data | spam | sensitive_context.
- ModelVerdict = { decision: allow | reject | uncertain; reasons: Reason[] }.
- ModerationDecision = ModelVerdict ditambah policyVersion: string. Server menambahkan versi; jangan menerima versi dari model.
- Respons publik tetap format error yang sudah ada, tidak menambah verdict model pada API browser.

- [ ] Tetapkan prompt berisi instruksi, definisi, kriteria dan contoh sintetis; kategori/reason mengikuti spec. Kritik sopan dan kesulitan emosional bukan hinaan/ajakan menyakiti diri.
- [ ] Buat 100 kasus tuning dan 200 evaluasi beku, dengan pembagian tepat pada spec. Setiap kasus mempunyai id, input, expected allow/reject, critical boolean dan tag bahasa/kategori; tidak menggunakan identitas siswa nyata.
- [ ] Tulis pemeriksaan fixture untuk jumlah, ID unik, disjoint tuning/evaluasi, 100 aman/100 tidak layak/50 kritis, serta panjang yang valid. Sediakan contoh aman seperti kritik fasilitas sopan dan nama biasa di recipient.
- [ ] Jalankan npm.cmd test -- src/test/content-safety.test.js untuk memastikan pemeriksaan fixture bekerja; catat bahwa panggilan model belum diuji.
- [ ] Catat prasyarat akun pengelola dewasa/sekolah, pemberitahuan/persetujuan data, ZDR dan kuota aktual. Prasyarat ini menghalangi penggunaan data nyata/aktivasi, bukan pembuatan filter lokal.

## Tahap 2 — Perkuat filter lokal tanpa mengubah isi

Files: content-safety.ts, moderation-policy.ts, content-safety.test.js.

Produces:

- normalizeForSafety(text: string): string.
- contentFingerprint(input: ModerationInput): Promise<string>, SHA-256 hex canonical JSON dengan urutan category, recipient, content.
- Pertahankan evaluateContentSafety dan readSafetyConfig bagi pemanggil yang ada; perluas safetyPolicyVersion dengan identitas kebijakan AI server.

- [ ] Tambahkan tes gagal untuk zero-width, angka pengganti yang dikenal, huruf berulang, pemisah, batas kata, kata biasa yang mengandung substring, aksara sah dan original NFC tetap identik.
- [ ] Jalankan npm.cmd test -- src/test/content-safety.test.js; pastikan gagal pada perilaku baru, bukan error setup.
- [ ] Implementasikan normalisasi hanya pada salinan pembanding; gunakan aturan eksplisit dan terbatas. Pelanggaran jelas ditolak lokal; istilah ambigu diteruskan ke AI. Pertahankan larangan kontak pada kedua field.
- [ ] Ubah konfigurasi istilah agar env menambah minimum rules, bukan menghapusnya. Bedakan konten krisis dari pembahasan emosional/edukatif dengan aturan konteks di AI.
- [ ] Hash policy tetap berformat v1:<64 hex>, mencakup aturan lokal, normalizer, prompt, schema, model, parameter dan versi konfigurasi server. Jangan memasukkan secret.
- [ ] Jalankan tes filter hingga lulus; tambahkan assert fingerprint berubah jika category/recipient/content berubah dan stabil untuk payload kanonis identik.

## Tahap 3 — Reservasi, kuota dan gate database

Files: migrasi baru, moderation_gate.sql, submit_receipt_regression.sql.

Interfaces server-only yang dibuat migrasi:

- lookup_submit_receipt(p_request_id uuid, p_payload_hash text): hasil kind missing/replay/conflict/expired dan receipt terenkripsi yang sudah ada bila replay.
- reserve_moderation(p_request_id uuid, p_payload_hash text, p_policy_version text): kind acquired/cached/busy/conflict, lease token/expiry atau verdict yang valid.
- reserve_moderation_quota(p_request_id uuid, p_lease_token uuid, p_reserved_tokens integer): izin atomik hanya bagi lease aktif dan budget yang cukup.
- finish_moderation(p_request_id uuid, p_lease_token uuid, p_decision text, p_reasons text[]): perbandingan token lease; hasil terlambat ditolak.
- release_moderation(p_request_id uuid, p_lease_token uuid): lepas lease gagal teknis tanpa menyimpan reject/uncertain permanen; hormati cooldown provider.
- submit_menfess_atomic: pertahankan argumen publik handler; tambahkan verifikasi allow/fingerprint/version secara internal dan bila perlu argumen fingerprint server-only.

- [ ] Tulis SQL tests yang gagal untuk direct insert tanpa allow, role anon/authenticated, hash salah, decision bukan allow, serta signature RPC lama.
- [ ] Buat moderation_decisions privat: request_id unik, payload HMAC aplikasi, policy_version, state evaluating/allow/reject/uncertain, fingerprint, lease token/expiry, alasan enum, waktu teknis. Tidak menyimpan teks atau respons mentah.
- [ ] Lease 15 detik, busy menghasilkan retry 15 detik. Request ID dengan hash berbeda selalu conflict. Versi kebijakan berbeda pada request belum diterima mengganti evaluasi secara atomik; lease lama tidak boleh finalisasi.
- [ ] Buat penghitung request/token privat per organisasi dan jendela menit/hari menggunakan row lock/upsert atomik. Batas budget diset dari kuota aktual akun; reservasi konservatif input UTF-8 byte count sebagai batas atas token + 1024 output, termasuk reasoning. Tolak payload/prompt yang melampaui reservasi tersedia; ukur kapasitas realistis saat evaluasi.
- [ ] Reservasi kuota sekali per lease; request replay/cache tidak mengurangi kuota. Timeout/transport gagal tetap dihitung konservatif. 429 menahan pemeriksaan baru sesuai cooldown. Jangan mengklaim penghitung lokal mengetahui pemakaian aplikasi lain dalam organisasi.
- [ ] Tambahkan messages.safety_content_hash. RPC baru menguji verdict allow, payload HMAC, fingerprint, dan policy_version sebelum insert; receipt/message/job tetap dalam transaksi yang sama. Batasi privileges tabel/fungsi ke service_role dan pola invoker/search_path yang sudah ada.
- [ ] Uji dua koneksi SQL terpisah untuk lease dan quota race, lease expiry + hasil lama, payload conflict, receipt expired/purged, serta satu job per request. Sesuaikan fixture regresi receipt agar menyediakan approval sintetis terlebih dahulu.
- [ ] Jalankan pada Supabase lokal dengan npm.cmd exec -- supabase start dan npm.cmd exec -- supabase test db. Jika runner SQL tidak mendukung file DO yang ada, jalankan file melalui psql pada database lokal dan nyatakan PASS/assert rollbacks; jangan mengubah format seluruh test suite.
- [ ] Tidak reset database berisi data nyata. Jika Docker/DB lokal tidak tersedia, tandai tes SQL belum dijalankan dan jangan mengklaim gate selesai.

## Tahap 4 — Groq dan integrasi submit

Files: moderation-provider.ts, moderation-provider.test.js, submit-menfess/index.ts, edge-handlers.test.js, supabase/.env.example.

Interfaces:

- readModerationConfig(getEnv: (name: string) => string | undefined): konfigurasi tervalidasi.
- ModerationConfig memuat apiKey, model, policyRevision dan empat batas kuota tervalidasi; hanya dipakai server/evaluator lokal.
- classifyMessage(input: ModerationInput, config: ModerationConfig, signal: AbortSignal): Promise<ModelVerdict>. Handler menambahkan policyVersion hasil hash server, bukan dari provider.
- Gangguan teknis dilempar sebagai error terklasifikasi aman; uncertain hanya hasil konteks model, bukan timeout.
- Nama secret: GROQ_API_KEY. Config server: MODERATION_MODEL=openai/gpt-oss-120b, MODERATION_POLICY_REVISION, MODERATION_REQUESTS_PER_MINUTE, MODERATION_REQUESTS_PER_DAY, MODERATION_TOKENS_PER_MINUTE, MODERATION_TOKENS_PER_DAY. Tidak ada default kuota production; nilai wajib sesuai akun dan juga dipakai konfigurasi quota DB tahap 3.

- [ ] Tes gagal untuk allow/reject/uncertain; allow dengan reasons berisi; reject dengan reasons kosong; reason asing; extra field; JSON rusak; refusal; finish_reason bukan stop; 401/429/5xx; transport error; abort 5 detik; prompt injection di recipient/content.
- [ ] Jalankan npm.cmd test -- src/test/moderation-provider.test.js src/test/edge-handlers.test.js dan pastikan failure sesuai fitur yang belum dibuat.
- [ ] Implementasikan POST fetch ke https://api.groq.com/openai/v1/chat/completions. System berisi kebijakan tetap; user berisi JSON ModerationInput sebagai data tidak tepercaya. Non-streaming, tanpa tools, strict json_schema dengan semua field required dan additionalProperties false. Validasi hasil lagi di server.
- [ ] Gunakan model tepat dari config yang diizinkan, reasoning_effort low, max_completion_tokens 1024 dan batas total provider 5 detik termasuk pembacaan body. Abort/response terpotong/hasil inkonsisten menjadi MODERATION_UNAVAILABLE, bukan allow.
- [ ] Urutan handler: validasi → secrets/HMAC payload → lookup receipt/conflict/tombstone → local reject → reserve decision → cached valid atau reserve quota + Groq → finalize lease → RPC → decrypt receipt. Replay tidak menjalankan AI/local policy terbaru lagi.
- [ ] Mapping: reject/uncertain 422 CONTENT_UNSAFE; error provider/config/kuota/lease busy 503 MODERATION_UNAVAILABLE; hash conflict 409. Retry-After dan CORS mengikuti helper yang ada. Jangan expose alasan mentah atau error upstream.
- [ ] Finalisasi hasil terjadi hanya jika lease masih sah. Jika RPC gagal setelah allow, retry memakai keputusan yang sah dan request ID sama. Jika provider gagal, release lease dan pertahankan draf; tidak menjalankan retry loop di Edge Function.
- [ ] Jalankan seluruh tes handler/filter/provider. Assert messages/receipt/job tidak dibuat untuk reject/uncertain/gagal, dan hanya satu panggilan model pada lease aktif.
- [ ] Isi supabase/.env.example dengan placeholder kosong dan batas konfigurasi; jangan menaruh key nyata di file tracked atau meminta key melalui chat.

## Tahap 5 — Feedback dan retry di form

Files: services/index.js, WritePage.jsx, ReviewPage.jsx, services/index.test.js, Flows.test.jsx.

- [ ] Tes gagal: 422 dan 503 menampilkan pesan, draf utuh, tombol kembali aktif, tidak ada halaman sukses palsu; double-click tetap satu submit.
- [ ] CONTENT_UNSAFE: tampilkan “Pesan belum dapat dikirim. Periksa kata-kata, informasi pribadi, atau isi yang dapat menyakiti orang lain.” Gunakan nada empatik untuk semua penolakan; jangan mengirim alasan model mentah atau menambahkan kode publik khusus yang membocorkan detektor sensitive_context.
- [ ] MODERATION_UNAVAILABLE: tampilkan “Pemeriksaan pesan sedang tidak tersedia. Pesan belum dikirim. Coba lagi nanti.” Mapping code harus diperiksa sebelum fallback status >=500.
- [ ] Selama menunggu gunakan indikator yang ada dengan teks “Memeriksa pesan...”; 202 tetap berarti diterima dalam antrean. Tidak mengubah desain atau menjanjikan langsung tayang.
- [ ] Saat payload kanonis category/recipient/content/rules_accepted berubah setelah percobaan submit, hapus request_id lama agar pengiriman berikutnya membuat ID baru. Jangan rotasi karena focus/navigasi, whitespace yang dinormalisasi identik, atau retry koneksi.
- [ ] Jalankan npm.cmd test -- src/services/index.test.js src/Flows.test.jsx; buktikan ID sama pada retry, ID baru hanya pada perubahan payload, draf tidak hilang dan tidak ada job ganda.

## Tahap 6 — Gate publikasi Instagram yang nyata

Files: content-safety.ts dan test-nya, modul worker nyata setelah ditemukan, moderation_gate.sql, dokumen API/safety. Jika perlu perubahan SQL tambahan, buat migrasi berikutnya.

Produces: assertPublishableModeration(input: ModerationInput, approval: { decision: string; contentHash: string; policyVersion: string }, currentPolicyVersion: string): Promise<void>. Throw jika tidak cocok; tidak melakukan publish sendiri.

- [ ] Cari worker sebenarnya di repositori/deployment yang diizinkan. Jika tidak tersedia, laporkan dependency ini dan jangan menulis pengganti atau mengklaim auto-publish selesai.
- [ ] Tes fingerprint berubah, policy lama, missing approval, deny/uncertain dan race edit saat job diproses. Batasi mutasi payload selama worker memegang job melalui mekanisme lock/version yang ada; gate harus mengikat snapshot yang benar-benar dirender dan diterbitkan.
- [ ] Panggil gate sebelum render/upload/publish. Jika antrean memakai policy lama, lakukan revalidasi lokal + AI melalui reservasi/kuota yang sama; tidak mengubah payload atau menciptakan receipt/job baru.
- [ ] Revalidasi gagal/meragukan menahan publikasi; gunakan transisi blocked/retry yang sudah sah pada state machine. Pertahankan idempotensi media/container Meta; jangan mengulang upload/publish buta ketika respons hilang.
- [ ] Public feed/detail/tracking tetap memakai sumber asli. Arsip published yang telah terlihat tidak dihapus atau diberi klaim AI-approved retroaktif. Antrean lama tidak boleh dipublikasikan tanpa revalidasi; jangan bulk-set approval.
- [ ] Buktikan worker dengan akun/sarana uji terisolasi dan izin terpisah sebelum publikasi produksi. Tanpa worker nyata, tahap filter boleh selesai lokal tetapi auto-publish tetap belum siap.

## Tahap 7 — Evaluasi kualitas, verifikasi dan rollout

Files: scripts/evaluate-moderation.mjs, fixture, dokumen hasil dan runbook.

- [ ] Buat evaluator yang memakai provider/policy produksi melalui import TypeScript yang kompatibel runtime proyek, data sintetis saja, tanpa log prompt/output mentah. Jalankan dengan node --experimental-strip-types scripts/evaluate-moderation.mjs. Secret hanya dari environment proses.
- [ ] Gunakan tuning set untuk memperbaiki aturan. Bekukan prompt/config sebelum evaluasi; jalankan 200 kasus evaluasi tiga putaran, mematuhi RPM/TPM/TPD akun. Jadwalkan beberapa sesi manual bila kuota harian tidak mencukupi; jangan menganggap 600 panggilan selalu muat sehari.
- [ ] Setiap putaran: 0/50 critical lolos, maksimal 5/100 aman salah ditahan, maksimal 5/100 tidak layak lolos. Laporkan uncertain secara terpisah, latensi, timeout dan token. Timeout tidak dihitung keputusan model yang benar; harus selesai dievaluasi ulang agar dataset lengkap.
- [ ] npm.cmd test, npm.cmd run lint, npm.cmd run build: semua lulus. Tidak ada script typecheck saat ini; bila Deno tersedia, jalankan deno check pada modul/handler Edge yang diubah dan catat hasil atau keterbatasan alat.
- [ ] SQL tests lokal lulus, termasuk race dua koneksi dan regresi receipt. Audit browser 360/1440 px: allow/reject/uncertain/provider down/kuota/retry/koreksi, keyboard, overflow dan reduced motion.
- [ ] Review kelayakan akun/sekolah, ZDR aktif, notice/consent yang diperlukan, kuota aktual dan hasil dataset. API key produksi tidak diperlukan untuk audit UI yang memakai transport uji.
- [ ] Setelah instruksi deployment: jeda worker → pasang migrasi gate → deploy backend → frontend → smoke test terisolasi → aktifkan worker hanya jika tahap 6 lulus. Pastikan jalur service_role lama tidak dapat melewati gate.
- [ ] Rollback mempertahankan gate dan menjeda publikasi bila bermasalah; jangan kembali ke versi tanpa moderasi. Pantau kode hasil, error/timeout/429 dan token tanpa teks siswa. Gunakan kanal pelaporan/takedown yang tersedia, bukan approval per pesan.
- [ ] Sebelum commit/push, tampilkan daftar file tugas dan hasil pemeriksaan; jalankan hanya jika pengguna menginstruksikan. Jangan stage dokumen sekolah, artifacts, asset tak terkait atau secret.

## Definition of done dan handoff

Plan dan spec siap ditinjau setelah builder check dan self-review; ini tidak menyatakan kode telah dibuat.

Filter lokal: tahap 1–2 lulus. Filter AI lokal: tahap 3–5 dan tes terisolasi lulus. Filter AI dengan data nyata: kelayakan layanan, konfigurasi dan evaluasi tahap 7 lulus. Auto-publish: tahap 6 serta rollout ujung ke ujung terbukti. Tahap yang terhalang harus dilaporkan sebagai belum terverifikasi.

Rekomendasi eksekusi: native berurutan dalam sesi ini karena perubahan filter, lease/RPC dan retry saling bergantung. Alternatif: subagent-driven dengan reviewer tiap tahap. Implementasi menunggu permintaan pengguna; pembuatan rencana tidak mengaktifkan layanan atau publikasi.

