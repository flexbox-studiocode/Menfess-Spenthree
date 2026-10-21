# K-04 deployment

Edge Functions:

- `submit-menfess`: anonymous POST, strict validation, atomic RPC, HMAC tracking, encrypted idempotency receipt.
- `track-menfess`: anonymous POST, HMAC lookup, safe status projection.

Anonymous gateway access is intentional because users do not log in. `verify_jwt = false` is configured; both functions enforce method, JSON shape, payload size, validation, generic errors, and `Cache-Control: no-store`. Production still requires a gateway/WAF rate limit or CAPTCHA. No in-memory limiter is claimed as reliable.

## Secrets

Configure only in Supabase Edge Function secrets or an equivalent server secret manager. Never put these in `.env`, `VITE_*`, Git, SQL, or browser code:

- `TRACKING_HASH_SECRET` — at least 32 random bytes.
- `PAYLOAD_HASH_SECRET` — separate at least 32 random bytes.
- `RECEIPT_ENCRYPTION_SECRET` — separate at least 32 random bytes; AES-GCM key material is derived server-side.
- `SUPABASE_SERVICE_ROLE_KEY` — project service-role key.
- `CORS_ORIGIN` — exact production frontend origin, not `*`.

Example using a local secret file outside Git:

```powershell
npx supabase secrets set --env-file C:\secure\menfess-k04.env
```

The file contains names and values only and must remain outside the repository. Do not print it. For hosted deployment:

```powershell
npx supabase functions deploy submit-menfess --no-verify-jwt
npx supabase functions deploy track-menfess --no-verify-jwt
```

`--no-verify-jwt` matches the committed config and must not be removed without adding an anonymous gateway strategy. Confirm the project ref before deployment.

## Database

Migrations `20261021170000_k04_submit_rpc.sql` and `20261021180000_k04_expired_receipt_guard.sql` create and harden `submit_menfess_atomic`. It is `SECURITY INVOKER`, uses `search_path = ''`, revokes public execution, and grants execution only to `service_role`. It inserts `messages`; the existing trigger creates exactly one `publication_jobs` row. It then inserts the encrypted receipt in the same transaction. Never insert a second publication job from the function.

```powershell
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase functions deploy submit-menfess --no-verify-jwt
npx supabase functions deploy track-menfess --no-verify-jwt
```

## Contract and testing

Submit request has exactly `request_id`, `category`, `recipient`, `content`, and `rules_accepted`. Content is NFC-normalized, trimmed, 10–500 Unicode code points, with only tab/newline controls allowed. Recipient is optional and max 80 code points. Tracking has only `{ "tracking_code": "SPT-..." }` and always uses POST.

The server creates a 128-bit random code. It stores only `v1:<HMAC>` in `messages`; the plaintext code is inside an encrypted receipt and returned once. Same `request_id` plus a different payload returns `409 IDEMPOTENCY_CONFLICT`; expired receipts return `409 RECEIPT_EXPIRED`. Timeout must be retried with the same request payload and ID. Generic 404 tracking responses do not reveal whether a message exists.

The automatic SQL tests cover schema constraints, trigger outbox, roles, and RLS. Add HTTP tests before production for malformed JSON, CORS, rate-limit behavior, concurrent identical submits, decrypt/replay, invalid tracking, and end-to-end one-message/one-job verification. Content checks are structural only; no universal harmful-content detector is claimed.

## Key rotation

Do not overwrite an active key blindly. Add a versioned secret and migration/Function support that can decrypt old receipt versions during the retention window, issue new receipts with the new version, then retire the old key after all receipts expire. Tracking HMAC rotation needs dual lookup (`v1` and new version) until all relevant tracking records are migrated. Never log keys or receipt plaintext.
