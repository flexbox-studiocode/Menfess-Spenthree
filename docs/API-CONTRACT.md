# Kontrak API awal — Kiandra / Reiner

Status: rancangan K-01/K-03, **belum ada endpoint yang diimplementasikan**. Sumber: PRD §10–12 dan arsitektur §5–7. Semua nama JSON menggunakan snake_case. Tidak ada login, panel staf, atau akses browser ke tabel internal.

## Nilai dan normalisasi

- `category`: `menfess`, `aspirasi`, `curhat`, `apresiasi`. Label filter Semua berarti parameter category dihilangkan, bukan kategori database.
- `content`: normalisasi NFC, CRLF menjadi LF, trim tepi; panjang 10–500 Unicode code point setelah normalisasi (JS `[...text].length`, bukan `text.length`). Tab/LF diperbolehkan, karakter kontrol lainnya ditolak. Server tetap memvalidasi ulang.
- `recipient`: null atau teks NFC yang di-trim, 1–80 code point, tanpa karakter kontrol; string kosong dinormalisasi menjadi null.
- Timestamp ISO 8601 UTC; UUID sebagai string; permalink nullable dan hanya URL posting Instagram HTTPS yang tervalidasi.
- Request strict: field internal/tidak dikenal ditolak. `request_id` UUID dibuat sekali per draft yang dikirim, dipertahankan pada retry payload identik.

| Status internal / respons tracking | Label aman |
|---|---|
| queued | Diterima |
| processing | Sedang diproses |
| publishing | Sedang dipublikasikan |
| published | Berhasil dipublikasikan |
| retry_scheduled | Sedang mengalami kendala |
| failed | Mengalami kendala |
| blocked | Tidak dapat diproses |

`published`, `failed`, `blocked` terminal. Frontend tidak menentukan transisi. Retry tracking terbatas dengan backoff; jangan menjanjikan waktu tayang.

## POST /functions/v1/submit-menfess

```json
{
  "request_id": "2abacfe2-fd14-4dbb-9893-f8882e655a37",
  "category": "apresiasi",
  "recipient": null,
  "content": "Terima kasih sudah membantu hari ini.",
  "rules_accepted": true
}
```

202 setelah transaksi pesan, job (trigger outbox), dan receipt terenkripsi berhasil commit:

```json
{
  "accepted": true,
  "tracking_code": "SPT-<kode-acak-server>",
  "status": "queued",
  "message": "Menfess diterima dan sedang diproses. Simpan kode pelacakanmu."
}
```

Tidak menunggu Instagram. Tracking code placeholder, bukan nilai yang boleh di-hardcode. Respons yang sama pada retry request/payload identik selama receipt belum kedaluwarsa (maksimal 24 jam); respons memakai `Cache-Control: no-store`. Payload berbeda pada request_id sama: 409 `IDEMPOTENCY_CONFLICT`. Setelah TTL: 409 `RECEIPT_EXPIRED`, tidak membuat pesan/job baru dan tidak membuat ulang kode tracking. Jangan log body/response. Validasi/konten ditolak tidak membuat job; blocked yang disimpan untuk operasi tidak perlu mengembalikan tracking code.

## GET /functions/v1/public-feed?category=...&cursor=...

Tambahan `limit`: default 20, maksimum 50. Urutan `published_at DESC, public_id DESC`, cursor opaque yang mengikat pasangan urutan serta kategori. Cursor/category invalid: 400; tidak diam-diam menjadi query bebas. Kueri terparameterisasi melalui view `published_messages` dengan limit.

200:

```json
{
  "data": [{
    "public_id": "df20ed8a-e621-4408-958a-c472cbe97d0b",
    "category": "apresiasi",
    "recipient": null,
    "content": "Terima kasih sudah membantu hari ini.",
    "published_at": "2026-10-21T15:00:00Z",
    "ig_permalink": null
  }],
  "next_cursor": null
}
```

Hanya enam field di atas. Tidak ada likes sementara P1 ditunda. Empty feed: data `[]`, next_cursor null. Cursor bukan tracking code. Jangan gunakan ID internal messages untuk URL detail.

## GET /functions/v1/public-menfess?id=...

`id` adalah `public_id` UUID acak. 200 `{"data": { ...enam field publik di atas... }}`. ID invalid: 400; ID tidak ada maupun belum published: 404 `NOT_FOUND` dengan pesan identik. Jangan membedakan keberadaan pesan privat.

## POST /functions/v1/track-menfess

Request `{"tracking_code":"SPT-<kode-acak-server>"}`. Tidak pernah query string/URL. 200:

```json
{
  "status": "queued",
  "message": "Pesan diterima dan menunggu proses.",
  "published_at": null,
  "ig_permalink": null
}
```

Hanya published boleh memiliki waktu/permalink. Tidak mengembalikan content, recipient, ID internal, tracking hash, atau error worker. Kode tidak dikenal: 404 `NOT_FOUND` dengan pesan generik. No-store, rate limit wajib; log request body dimatikan.

## Error generik

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Periksa kembali data yang dikirim.",
    "request_id": "<correlation-id-acak-server>",
    "fields": { "content": "Isi harus 10–500 karakter." }
  }
}
```

`fields` opsional, hanya nama field publik allowlist. `error.request_id` correlation ID server, bukan tracking code. Kode: 400 VALIDATION_ERROR, 403 CONTENT_REJECTED, 404 NOT_FOUND, 409 IDEMPOTENCY_CONFLICT/RECEIPT_EXPIRED, 413 PAYLOAD_TOO_LARGE, 429 RATE_LIMITED (Retry-After), 500 INTERNAL_ERROR, 503 SERVICE_UNAVAILABLE. Tidak mengembalikan stack trace, nama tabel, aturan deteksi, respons Meta, token, hash, maupun last_error_code job.

## Keputusan penyelarasan

- Diagram arsitektur §4 menyebut GET status; tabel endpoint dan PRD mewajibkan **POST track-menfess**, itu yang digunakan.
- Path `.PRD/` di task backend sudah usang; dokumen nyata berada di `.Menfess-Spenthree/`.
- Tidak ada status `pending`; gunakan queued. Job memiliki state tersendiri, jangan dipakai sebagai status UI.
- Batas recipient ditetapkan 80; public_id dipisahkan dari id internal. CSS Modules dipakai bersama Reiner, tanpa Tailwind.
- Autentikasi gateway Edge Functions untuk pengunjung anonim, CORS allowlist, payload limit, challenge/rate limit, polling serta RPC transaksi submit diselesaikan K-04/K-05, bukan task fondasi ini. Publishable key bukan autentikasi pengguna atau perlindungan abuse.

## Safety-approved timeline extension (2026-10-22)

Public feed/detail now return safety-approved messages in `queued`, `processing`, `publishing`, `retry_scheduled`, `published`, or `failed`; `blocked` and unreviewed legacy rows remain hidden. The public projection adds `status` and `created_at`, orders by `(created_at DESC, public_id DESC)`, and never exposes internal IDs, tracking hashes, safety metadata, or job fields. UI must label status honestly and only show Instagram links when present and valid.

Submit applies the same contact/forbidden-term policy to both `content` and non-null `recipient`. Unsafe fields return `422 CONTENT_UNSAFE` and no message or publication job is created.

## AI moderation gate (2026-10-22)

The five-field request and 202 receipt stay unchanged. New submissions require local checks and a server-side Groq allow decision. Reject/uncertain returns 422 CONTENT_UNSAFE; provider/config/quota/lease failures return 503 MODERATION_UNAVAILABLE with Retry-After, without message/job creation. Accepted receipts replay before the newest model/policy, retaining 24-hour expiry/tombstone and 409 conflict semantics. Changed canonical payloads get a new request ID; network retries retain it. Internal approval metadata never enters public projections. Publication starts disabled and requires current policy plus immutable content fingerprint. See [AI moderation runbook](AI-MODERATION.md).
