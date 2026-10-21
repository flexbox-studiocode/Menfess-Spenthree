# Fondasi database K-03

Migration sumber kebenaran: `supabase/migrations/20261021140000_foundation.sql` dan `20261021150000_publication_metadata.sql` (PostgreSQL 17). Migration kedua ditambahkan setelah migration pertama terpasang lokal; tidak mengedit migration terpasang. Tidak ada endpoint/publisher pada tahap ini.

## Skema

- `messages`: UUID internal + public_id UUID acak unik, request_id UUID unik permanen selama row ada, tracking_code_hash unik `v1:<64 hex>`, kategori allowlist, recipient nullable 1–80, content 10–500 code point, status allowlist, timestamps, media ID unik, permalink Instagram tervalidasi, rendered_image_path. Published wajib published_at dan ig_media_id; permalink tetap opsional karena konfirmasi media dapat berhasil sebelum permalink tersedia. Status lain tidak boleh memiliki published_at, ig_media_id, atau ig_permalink.
- `publication_jobs`: satu row per message melalui FK unique dengan cascade. Status queued/processing/retry_scheduled/completed/failed, attempt_count 0–10, next_attempt_at, lease timestamps + lock_token untuk rancangan claim worker berikutnya, kode error allowlist tanpa payload bebas. Lease wajib hanya ketika processing. Indeks parsial due-job/lease.
- `idempotency_receipts`: satu receipt per request_id yang sudah ada, payload_hash berformat versi HMAC, ciphertext bytea maksimum 8 KiB, encryption_key_version dan TTL maksimal 24 jam. Indeks expiry.
- `published_messages`: view security_invoker + security_barrier; hanya public_id, category, recipient, content, published_at, ig_permalink dengan status published. Hanya backend dapat membaca view, publik lewat Edge Functions K-05.
- Indeks feed parsial (published_at, public_id) dan (category, published_at, public_id); unique constraints sudah menyediakan indeks tracking/request/FK utama. Tidak menambahkan indeks redundan.
- `message_likes` ditunda P1 sampai desain anti-abuse tersedia. Tidak ada IP, fingerprint, akun pengirim, atau token Instagram.

## Integritas

Trigger invoker dengan search_path kosong memperbarui updated_at, memvalidasi state message, dan membuat job otomatis pada INSERT queued dalam transaksi yang sama. INSERT blocked tidak membuat job. K-04 **tidak boleh memasukkan job lagi** setelah insert pesan. Transisi: queued→processing/failed; processing→publishing/retry_scheduled/failed; publishing→published/retry_scheduled/failed; retry_scheduled→processing/failed. Published/blocked/failed terminal. Claim atomik, transisi job, rekonsiliasi, retry, dan sinkronisasi job/message adalah pekerjaan K-06, belum diimplementasikan.

## RLS dan grants

RLS aktif pada tiga tabel internal. Tidak ada policy anon/authenticated: default-deny disengaja. Semua privileges pada tabel/view dan fungsi dicabut dari PUBLIC, anon, authenticated. Service_role mendapat SELECT/INSERT/UPDATE pada messages, SELECT/INSERT/UPDATE/DELETE pada jobs/receipts, SELECT view dan EXECUTE helper. Migration kedua mencabut DELETE messages untuk mempertahankan tombstone request; hanya pemilik database dapat melakukan maintenance penghapusan terkontrol. Supabase service_role memang bypass RLS: simpan hanya di secret environment server, jangan forward Authorization pengunjung sebagai kredensial DB server. Tidak ada SECURITY DEFINER atau policy USING(true).

Browser tidak boleh memakai `.from('messages')`, `.from('publication_jobs')`, atau receipt. Akses publik melalui Edge Functions yang memilih kolom allowlist. Feed/detail membaca view ditambah filter/limit/cursor; tracking memverifikasi HMAC dan memilih status aman saja. Service_role berprivilege luas untuk tiga tabel ini; endpoint harus memvalidasi request dan tidak meneruskan query/properti klien tanpa allowlist. Trigger bukan pengganti autentikasi worker.

## Tracking dan idempotensi untuk K-04

1. Server membuat minimal 128 bit acak kriptografis, encoding tracking kanonis `SPT-...`.
2. HMAC-SHA-256 atas kode kanonis dengan `TRACKING_HASH_SECRET` dari secret manager server; simpan `v1:<hex>`. Tidak ada secret/hash generator dalam SQL. Lookup HMAC memakai query terparameterisasi; respons generik dan rate limiting membatasi tebakan. Secret version v1 harus tetap tersedia selama kode masih berlaku; rotasi format versi melalui migration berikutnya, jangan mengganti secret tanpa strategi migrasi.
3. HMAC payload kanonis dengan secret server terpisah, untuk deteksi payload berubah tanpa membuka isi. Encrypt tanda terima dengan AEAD (misalnya AES-256-GCM), kunci server terpisah, random nonce dan authentication tag disertakan ciphertext, AAD request_id + key version. Jangan menyimpan key bersama ciphertext.
4. RPC `submit_menfess_atomic` server-only membuat message (trigger membuat job) + receipt secara atomik. Jangan tiga request REST terpisah. Unique request_id melindungi race. Edge Functions K-04 memanggil RPC; secrets tetap di runtime server.
5. Retry identik hanya boleh decrypt receipt bila expires_at > now(); payload berbeda 409. Receipt expired tidak boleh dipakai walau menunggu purge. Request_id tetap di messages sehingga retry sesudah purge tidak membuat duplikat; balas RECEIPT_EXPIRED.

## Retensi

`pg_cron` menjalankan purge receipt setiap jam pada menit 17. TTL logis maksimum 24 jam; penghapusan fisik maksimal satu jam kemudian. Fungsi purge invoker hanya dapat dijalankan server/pemilik. Jadwal dapat diperiksa lewat cron.job tanpa melihat data receipt. Tidak mengaktifkan backup plaintext receipt; ciphertext tetap sensitif dan backup mengikuti kebijakan provider.

Pesan/job/aset belum memiliki auto-delete: penghapusan messages akan menghapus request tombstone dan bisa melemahkan idempotensi. Keputusan kebijakan sekolah/pemilik dibutuhkan sebelum rilis. Usulan untuk dibahas: blocked 7 hari, failed job/log 30 hari, aset gagal 7 hari, pesan published sesuai kebijakan takedown; implementasi wajib mempertahankan tombstone request terpisah sebelum menghapus messages. Tidak memasang cron penghapus konten yang belum disetujui. Tidak ada storage bucket atau worker dibuat prematur.

## Workflow migration

- Jangan edit migration setelah terpasang; buat migration timestamp baru. Tidak menjalankan ulang SQL awal, reset, atau drop untuk mengatasi duplicate objects.
- `npx supabase migration list --linked`, `npx supabase db push --linked --dry-run`, lalu `npx supabase db push --linked` untuk dev yang identitasnya sudah diverifikasi.
- Eksekusi ulang db push harus no-op lewat riwayat migration.
- Tes `npx supabase db query --local --file supabase/tests/foundation.sql` atau `--linked` pada dev. Fixture sintetis dibatalkan melalui exception khusus yang ditangkap pada subtransaksi DO; semua assertion error lain tetap menggagalkan tes. Format single statement mendukung db query CLI 2.121.0 yang menolak beberapa command prepared sekaligus. Tidak ada data nyata dicetak. Tes bukan untuk produksi.
- `npx supabase db lint --local` / `--linked` memeriksa fungsi. Akses grants negatif diuji dengan SET LOCAL ROLE anon dan authenticated; service_role diuji positif. Sebelum rilis tambahkan tes HTTP Data API/Edge Functions, concurrency submit/claim dan expiry replay saat endpoint tersedia.
