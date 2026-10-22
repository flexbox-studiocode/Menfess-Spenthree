# K-06 publication pipeline

## Runtime

Renderer: Vercel Node Function `api/render-menfess.js`, `sharp` JPEG encoder. It produces a real 1080×1350 JPEG from sanitized SVG text; SVG is never returned as the publication asset. The renderer is server-to-server only and requires `RENDERER_SECRET`.

Worker: Supabase Edge Function `process-publication-queue`. It uses an atomic `FOR UPDATE SKIP LOCKED` RPC, leases jobs for 240 seconds, persists the Instagram container ID before publish, and requires `WORKER_CRON_SECRET` plus `INSTAGRAM_PUBLISH_ENABLED=true`.

## Required server secrets

Set through Vercel/Supabase secret management. Never place values in Git, `.env.example`, frontend variables, logs, or chat:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TRACKING_HASH_SECRET`
- `PAYLOAD_HASH_SECRET`
- `RECEIPT_ENCRYPTION_SECRET`
- `WORKER_CRON_SECRET`
- `RENDERER_SECRET`
- `RENDERER_URL`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `INSTAGRAM_API_VERSION`
- `INSTAGRAM_PUBLISH_ENABLED=false` initially

Use one authentication path consistently. For Instagram Login, verify professional Business/Creator account, `instagram_business_content_publish`, user ID, token validity, and active API version in Meta Developer Dashboard. Do not mix Facebook Login configuration with Instagram Login tokens.

## Activation

1. Apply the new migration without editing earlier migrations.
2. Deploy renderer and worker.
3. Configure secrets and test a read/diagnostic Meta request without publishing.
4. Verify the generated URL externally and inspect JPEG magic bytes/dimensions.
5. Keep `INSTAGRAM_PUBLISH_ENABLED=false`.
6. Review legacy jobs: pre-K-06 rows have `eligible_at IS NULL` and are not processed.
7. Selectively activate a reviewed legacy job using the server-only RPC `activate_legacy_publication_job(job_id)`.
8. Run one approved test publication, reconcile its media ID/permalink, then set the kill switch true.

## Cron

Configure `pg_cron`/`pg_net` operationally after secrets exist. The migration intentionally does not embed project URLs, keys, or worker secrets. Invoke the worker once per minute with `Authorization: Bearer <WORKER_CRON_SECRET>`. Keep concurrency bounded. Emergency stop: set `INSTAGRAM_PUBLISH_ENABLED=false`, then disable the cron job.

## Ambiguous publish

A timeout after `media_publish` must not be retried as a new publish. The worker requires reconciliation before retry implementation is enabled. Operationally inspect the persisted container/media state through Meta and mark the job `PUBLISH_AMBIGUOUS` when publication cannot be proven.

## Token lifecycle

Obtain and validate tokens in Meta Developer Dashboard, test with a non-publishing read request, record expiry/permission metadata outside the repository, rotate by replacing the server secret, and revoke the old token after the new token is verified. Never paste tokens into issue comments, chat, SQL, or logs.

## Retention

Keep rendered assets while a job can retry or publication state is uncertain. Delete only after a terminal outcome and the operational retention period. Do not place unapproved or blocked content in the bucket.
