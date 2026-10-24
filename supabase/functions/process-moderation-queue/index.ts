import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentFingerprint, evaluateContentSafety, readSafetyConfig, safetyPolicyVersion } from "../_shared/content-safety.ts";
import { classifyMessage, ModerationUnavailable, readModerationConfig, reservedModerationTokens } from "../_shared/moderation-provider.ts";
import type { ModerationInput } from "../_shared/moderation-policy.ts";
import { json, logFailure } from "../_shared/http.ts";

Deno.serve(async req => {
  const secret = Deno.env.get("MODERATION_WORKER_SECRET");
  if (req.method !== "POST" || !secret || secret.length < 32 || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404 });
  const rid = crypto.randomUUID();
  let processed = 0;
  try {
    const config = readModerationConfig(key => Deno.env.get(key));
    const safety = readSafetyConfig(key => Deno.env.get(key));
    const recipientSafety = { ...safety, minCodePoints: 1, maxCodePoints: 80 };
    const policy = await safetyPolicyVersion(safety, recipientSafety, config.policyRevision);
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new ModerationUnavailable();
    const db = createClient(url, key);
    const call = async (name: string, params: Record<string, unknown>) => {
      const { data, error } = await db.rpc(name, params);
      if (error) throw new ModerationUnavailable();
      return data;
    };
    for (let i = 0; i < 3; i++) {
      // Claim one at a time so a quota stop does not strand the rest of a batch.
      const sources = i % 2 === 0 ? ["message", "intake"] : ["intake", "message"];
      let job;
      let source;
      for (const candidate of sources) {
        const jobs = await call(candidate === "message" ? "claim_message_moderation_jobs" : "claim_moderation_intake",
          candidate === "message" ? { p_limit: 1, p_policy_version: policy } : { p_limit: 1 });
        if (!Array.isArray(jobs)) throw new ModerationUnavailable();
        if (jobs[0]) { job = jobs[0]; source = candidate; break; }
      }
      if (!job) break;
      const queueLease = source === "message"
        ? { p_message_id: job.message_id, p_lease_token: job.lease_token }
        : { p_request_id: job.request_id, p_lease_token: job.lease_token };
      const settle = source === "message" ? "settle_message_moderation_job" : "settle_moderation_intake";
      const release = source === "message" ? "release_message_moderation_job" : "release_moderation_intake";
      let moderationLease: Record<string, unknown> | undefined;
      try {
        const input: ModerationInput = job.input;
        const [contentCheck, recipientCheck] = await Promise.all([
          evaluateContentSafety(input.content, safety),
          input.recipient === null ? Promise.resolve(null) : evaluateContentSafety(input.recipient, recipientSafety),
        ]);
        let decision = "local_reject";
        if (contentCheck.approved && recipientCheck?.approved !== false) {
          const reservation = await call("reserve_moderation", { p_request_id: job.request_id, p_payload_hash: job.payload_hash,
            p_policy_version: policy, p_content_hash: await contentFingerprint(input) });
          if (reservation?.kind === "cached") decision = reservation.decision;
          else if (reservation?.kind === "acquired" && typeof reservation.lease_token === "string") {
            moderationLease = { p_request_id: job.request_id, p_lease_token: reservation.lease_token };
            const quota = await call("reserve_moderation_quota", { ...moderationLease, p_reserved_tokens: reservedModerationTokens(input),
              p_rpm: config.requestsPerMinute, p_rpd: config.requestsPerDay, p_tpm: config.tokensPerMinute, p_tpd: config.tokensPerDay });
            if (quota !== true) throw new ModerationUnavailable(60);
            const verdict = await classifyMessage(input, config, req.signal);
            if (await call("finish_moderation", { ...moderationLease, p_decision: verdict.decision, p_reasons: verdict.reasons }) !== true) throw new ModerationUnavailable();
            moderationLease = undefined;
            decision = verdict.decision;
          } else throw new ModerationUnavailable(60);
        }
        if (await call(settle, { ...queueLease, p_decision: decision, p_policy_version: policy }) !== true) throw new ModerationUnavailable();
        processed++;
      } catch (cause) {
        logFailure(rid, "moderation_queue", cause);
        const retry = Math.max(60, cause instanceof ModerationUnavailable ? cause.retryAfter : 60);
        if (moderationLease) await call("release_moderation", { ...moderationLease, p_retry_after: retry });
        await call(release, { ...queueLease, p_retry_after: retry });
        return json({ processed, deferred: true }, 202);
      }
    }
    return json({ processed }, 200);
  } catch (cause) {
    logFailure(rid, "moderation_worker", cause);
    return json({ processed, deferred: true }, 503);
  }
});
