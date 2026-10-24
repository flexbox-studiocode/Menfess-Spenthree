# K-06 publication pipeline

AI integration: follow [AI-MODERATION.md](AI-MODERATION.md) before activating. Both the environment kill switch and moderation_control.publishing_enabled must allow publication. Claims require current AI allow and matching immutable fingerprint. The worker rechecks approval before upload and after container readiness, then calls prepare_ai_publication to atomically verify lease/approval and persist the ambiguous-at marker before Meta publish. Ambiguous attempts are quarantined from future claims until reconciliation. Do not enable publication until the AI evaluation, server configuration and deployment checks pass.

## Runtime

Renderer: Vercel Node Function `api/render-menfess.js`, `sharp` JPEG encoder. It produces a real 1080×1350 JPEG from sanitized SVG text; SVG is never returned as the publication asset. The renderer is server-to-server only and requires `RENDERER_SECRET`.

Worker: Supabase Edge Function `process-publication-queue`. It uses an atomic `FOR UPDATE SKIP LOCKED` RPC, claims one job at a time (maximum three per invocation), leases for 240 seconds, and persists the Instagram container ID before publish. It requires `WORKER_CRON_SECRET`, explicit `INSTAGRAM_AUTH_MODE`, and `INSTAGRAM_PUBLISH_ENABLED=true`. Meta requests have a 15-second deadline; failed publish outcomes are quarantined rather than retried blindly. Local website admission never substitutes for authoritative AI queue settlement.

## Required server secrets

Set through Vercel/Supabase secret management. Never place values in Git, `.env.example`, frontend variables, logs, or chat:

- `SUPABASE_SERVICE_ROLE_KEY`
- `TRACKING_HASH_SECRET`
- `PAYLOAD_HASH_SECRET`
- `RECEIPT_ENCRYPTION_SECRET`
- `WORKER_CRON_SECRET`
- `RENDERER_SECRET`
- `RENDERER_URL`
- `INSTAGRAM_AUTH_MODE` (`instagram_login` or `facebook_login`; required, no deployment default)
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `INSTAGRAM_API_VERSION`
- `INSTAGRAM_PUBLISH_ENABLED=false` initially

Use one authentication path consistently. `instagram_login` selects `graph.instagram.com`; `facebook_login` selects `graph.facebook.com`. The worker refuses a missing/invalid mode rather than guessing or trying both hosts. For Instagram Login, verify professional Business/Creator account, `instagram_business_content_publish`, user ID, token validity, and active API version in Meta Developer Dashboard against current Meta documentation. Facebook Login requires its own matching account linkage/permissions/token. Do not mix these paths. This release posts to one operator-managed account; it does not implement an interactive OAuth connection button. Token refresh/rotation remains an operator responsibility.

Meta requirements reference (checked 24 October 2026): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/ . Instagram Login needs `instagram_business_basic` and `instagram_business_content_publish`; Facebook Login uses its matching Page token/permissions. Requirements and access review must be confirmed for the actual app/account before activation.

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

Configure `pg_cron`/`pg_net` after secrets exist using `select public.configure_worker_schedules();` (returns false until Vault setup is complete). Store the project base URL as Vault `SUPABASE_PROJECT_URL`, moderation secret as `MODERATION_WORKER_SECRET`, and publication secret as `WORKER_CRON_SECRET`; values must match the Edge Function configuration. Do not commit secret insertion SQL. The scheduler uses `net.http_post`, not `extensions.http_post`, and must target this deployment rather than a hardcoded project. Invoke both workers once per minute. Re-running setup must not duplicate jobs; inspect `cron.job_run_details` and pg_net responses to verify execution. Keep concurrency bounded. Emergency stop: set `INSTAGRAM_PUBLISH_ENABLED=false`, close the DB gate, then disable the publication cron job.

## Ambiguous publish

A timeout after `media_publish` must not be retried as a new publish. The worker persists `PUBLISH_AMBIGUOUS` and quarantines the job, including a container already reporting `PUBLISHED` without a local confirmation. Inspect persisted container/media state through Meta. Only the DB owner can call `reconcile_publication_job(p_job_id,p_outcome,p_evidence_sha256,p_reason_code,p_media_id,p_permalink)`; browser and service_role cannot. For confirmed publication use outcome `published`, reason `meta_media_verified`, verified media ID and optional permalink. For proven nonpublication use `not_published` and `meta_nonpublication_verified`; missing receipt/timeout is not proof. First close the DB publishing gate, disable scheduler/worker publication, wait for every old invocation and HTTP request to drain, and verify this operationally. The RPC additionally requires the ambiguous marker to be at least 15 minutes old and the DB gate closed. Never reset while an old invocation can resume; after reconciliation, verify state before reopening the gate. Store a SHA-256 reference to external evidence, not credentials or message text. Reconciliation is audited; retry remains bounded and requires current AI allow. A late confirmed success from the original durable attempt may be recorded after switch-off without making a new Meta request.

## Token lifecycle

Obtain and validate tokens in Meta Developer Dashboard, test with a non-publishing read request, record expiry/permission metadata outside the repository, rotate by replacing the server secret, and revoke the old token after the new token is verified. Never paste tokens into issue comments, chat, SQL, or logs.

## Retention

Keep rendered assets while a job can retry or publication state is uncertain. Delete only after a terminal outcome and the operational retention period. Do not place unapproved or blocked content in the bucket.
