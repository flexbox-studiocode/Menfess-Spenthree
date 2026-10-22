# Content safety and timeline

Migration `20261022040000_content_safety_timeline.sql` adds explicit safety approval metadata. Existing rows are deliberately left with `safety_approved_at = NULL`; even legacy published rows are excluded until trusted server-side revalidation records an approval. Do not manually alter content or status to expose legacy data.

`timeline_messages` is a `security_invoker`, `security_barrier` projection. It exposes only approved rows in public lifecycle states and grants `SELECT` only to `service_role`. Public feed pagination is descending `(created_at, public_id)` and cursors are bound to the requested category.

Submit runs deterministic safety checks before encryption, RPC, message insert, and outbox job creation. It rejects email addresses, phone numbers, URLs, social handles, and comma-separated case-insensitive terms configured by `CONTENT_SAFETY_FORBIDDEN_TERMS`. Maximum 200 terms and 80 code points per term. Rejections return `CONTENT_UNSAFE` without calling the database, preserving the no-message/no-job invariant. Policy versions are SHA-256 hashes of canonical rule configuration and are stored with approval timestamps.

Changing safety rules requires updating the deterministic module, its tests, and revalidating old rows through a reviewed service-role process. Never bulk-set approval fields without evaluating each stored message under the recorded policy.

