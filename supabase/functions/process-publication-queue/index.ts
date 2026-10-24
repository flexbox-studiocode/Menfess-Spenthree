import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsForRequest, json, logFailure } from "../_shared/http.ts";
import { createContainer, containerStatus, mediaPermalink, parseContainerStatus, publishContainer, readInstagramConfig } from "../_shared/instagram.ts";
import { assertPublishableModeration, readSafetyConfig, safetyPolicyVersion } from "../_shared/content-safety.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const maxJobs = 3;
const caption = (category: string) => `Menfess Spenthree — ${category}\n\n#MenfessSpenthree #SMPN3Sokaraja`;

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const startedAt = Date.now();
  const cors = corsForRequest(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
  const secret = Deno.env.get("WORKER_CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404, headers: cors });
  if (Deno.env.get("INSTAGRAM_PUBLISH_ENABLED") !== "true") return json({ accepted: true, skipped: "disabled" }, 202, cors);
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Not found", { status: 404, headers: cors });
  const db = createClient(url!, serviceKey!);
  try {
    const ig = readInstagramConfig(key => Deno.env.get(key));
    const safety = readSafetyConfig(key => Deno.env.get(key));
    const policy = await safetyPolicyVersion(safety, { ...safety, minCodePoints: 1, maxCodePoints: 80 }, Deno.env.get("MODERATION_POLICY_REVISION"));
    const { data: control, error: controlError } = await db.from("moderation_control").select("active_policy,publishing_enabled").eq("singleton", true).single();
    if (controlError) throw controlError;
    if (!control?.publishing_enabled || control.active_policy !== policy) return json({ accepted: true, skipped: "moderation_disabled" }, 202, cors);
    let processed = 0;
    let deferred = 0;
    let failed = 0;
    for (let index = 0; index < maxJobs; index++) {
      // Claim one at a time: later jobs must not lose their lease while rendering earlier jobs.
      if (Date.now() - startedAt >= 90_000) break;
      const { data: jobs, error } = await db.rpc("claim_publication_jobs", { p_limit: 1, p_lease_seconds: 240 });
      if (error || !Array.isArray(jobs)) throw new Error("INTERNAL_ERROR");
      const job = jobs[0];
      if (!job) break;
      let publishAttempted = false;
      try {
        const { data: message, error: readError } = await db.from("messages").select("id,request_id,category,recipient,content,status,rendered_image_path,safety_approved_at,safety_policy_version,safety_content_hash").eq("id", job.message_id).single();
        if (readError || !message) throw readError || new Error("MODERATION_REQUIRED");
        const checkApproval = async () => {
          const { data: approval, error: approvalError } = await db.from("moderation_decisions").select("state,content_hash,policy_version").eq("request_id", message.request_id).single();
          if (approvalError || !approval || !message.safety_approved_at || message.safety_content_hash !== approval.content_hash) throw new Error("MODERATION_REQUIRED");
          await assertPublishableModeration(message, { decision: approval.state, contentHash: approval.content_hash, policyVersion: approval.policy_version }, policy);
        };
        const lease = async () => {
          const { data: current, error: gateError } = await db.from("moderation_control").select("active_policy,publishing_enabled").eq("singleton", true).single();
          if (gateError || !current?.publishing_enabled || current.active_policy !== policy) throw new Error("MODERATION_REQUIRED");
          const { data, error } = await db.from("publication_jobs").select("status,lock_token,lease_expires_at,container_id,ambiguous_at").eq("id", job.job_id).single();
          if (error || !data || data.status !== "processing" || data.lock_token !== job.lock_token || !Number.isFinite(Date.parse(data.lease_expires_at)) || Date.parse(data.lease_expires_at) <= Date.now()) throw new Error("INTERNAL_ERROR");
          if (data.ambiguous_at) throw new Error("PUBLISH_AMBIGUOUS");
          await checkApproval();
          return data;
        };
        const updateJob = async (values: Record<string, unknown>) => {
          const { data, error } = await db.from("publication_jobs").update(values).eq("id", job.job_id).eq("lock_token", job.lock_token).eq("status", "processing").select("id");
          if (error || !data || data.length !== 1) throw new Error("INTERNAL_ERROR");
        };
        const updateMessage = async (values: Record<string, unknown>, states: string[]) => {
          const { data, error } = await db.from("messages").update(values).eq("id", job.message_id).in("status", states).select("id");
          if (error || !data || data.length !== 1) throw new Error("INTERNAL_ERROR");
        };
        const claimed = await lease();
        if (["queued", "retry_scheduled"].includes(message.status)) await updateMessage({ status: "processing" }, [message.status]);
        // Renderer is deployed separately; its secret never reaches the browser.
        const rendererUrl = Deno.env.get("RENDERER_URL"); const rendererSecret = Deno.env.get("RENDERER_SECRET");
        if (!rendererUrl || !rendererSecret) throw new Error("RENDER_FAILED");
        const rendered = await fetch(rendererUrl, { method: "POST", signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${rendererSecret}`, "content-type": "application/json" }, body: JSON.stringify({ category: message.category, recipient: message.recipient, content: message.content }) });
        if (!rendered.ok) throw new Error("RENDER_FAILED");
        const objectPath = `${crypto.randomUUID()}.jpg`;
        const image = await rendered.arrayBuffer();
        await lease();
        const { error: uploadError } = await db.storage.from("instagram-publications").upload(objectPath, image, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw new Error("RENDER_FAILED");
        const { data: publicUrl } = db.storage.from("instagram-publications").getPublicUrl(objectPath);
        await updateMessage({ status: "publishing", rendered_image_path: objectPath }, ["processing", "publishing"]);
        let containerId = claimed.container_id;
        if (!containerId) {
          await lease();
          const created = await createContainer(ig, publicUrl.publicUrl, caption(message.category));
          if (typeof created.id !== "string" || !/^\d+$/.test(created.id)) throw new Error("IG_TEMPORARY");
          containerId = created.id;
          await updateJob({ container_id: containerId, last_stage: "container_created" });
        }
        let ready = false;
        for (let i = 0; i < 8; i++) {
          const state = parseContainerStatus(await containerStatus(ig, containerId!));
          if (state === "FINISHED") { ready = true; break; }
          if (state === "PUBLISHED") throw new Error("PUBLISH_AMBIGUOUS");
          if (["ERROR", "EXPIRED"].includes(state)) {
            // No publish attempt exists yet. A subsequent retry may create a fresh container.
            await updateJob({ container_id: null, last_stage: "container_unavailable" });
            throw new Error("MEDIA_UNAVAILABLE");
          }
          await wait(1500);
        }
        if (!ready) throw new Error("IG_TEMPORARY");
        await lease();
        const { data: prepared, error: prepareError } = await db.rpc("prepare_ai_publication", { p_job_id: job.job_id, p_lock_token: job.lock_token, p_policy_version: policy });
        if (prepareError || prepared !== true) throw new Error("MODERATION_REQUIRED");
        // Do not let a paused invocation resume a publication after its lease/deadline.
        req.signal.throwIfAborted();
        if (Date.now() - startedAt >= 120_000) throw new Error("PUBLISH_AMBIGUOUS");
        const { data: attempt, error: attemptError } = await db.from("publication_jobs")
          .select("status,lock_token,lease_expires_at,publication_attempt_token,ambiguous_at")
          .eq("id", job.job_id).single();
        if (attemptError || attempt?.status !== "processing" || attempt.lock_token !== job.lock_token
          || attempt.publication_attempt_token !== job.lock_token || !attempt.ambiguous_at
          || Date.parse(attempt.lease_expires_at) <= Date.now()) throw new Error("PUBLISH_AMBIGUOUS");
        req.signal.throwIfAborted();
        if (Date.now() - startedAt >= 120_000) throw new Error("PUBLISH_AMBIGUOUS");
        publishAttempted = true;
        const published = await publishContainer(ig, containerId!, req.signal);
        if (typeof published.id !== "string" || !/^\d+$/.test(published.id)) throw new Error("PUBLISH_AMBIGUOUS");
        const mediaId = published.id;
        const permalink = await mediaPermalink(ig, mediaId).then((x) => typeof x.permalink === "string" ? x.permalink : null).catch(() => null);
        const { data: completed, error: completionError } = await db.rpc("complete_publication_job", {
          p_job_id: job.job_id,
          p_lock_token: job.lock_token,
          p_media_id: mediaId,
          p_permalink: permalink,
        });
        if (completionError || completed !== true) throw new Error("INTERNAL_ERROR");
        processed++;
      } catch (cause) {
        logFailure(rid, "job", cause);
        const known = new Set(["RENDER_FAILED", "MEDIA_UNAVAILABLE", "IG_RATE_LIMIT", "IG_AUTH_REQUIRED", "IG_TEMPORARY", "PUBLISH_AMBIGUOUS", "MODERATION_REQUIRED", "RETRY_EXHAUSTED", "INTERNAL_ERROR"]);
        const errorCode = publishAttempted ? "PUBLISH_AMBIGUOUS"
          : known.has(String((cause as Error).message)) ? String((cause as Error).message) : "INTERNAL_ERROR";
        const retryable = ["RENDER_FAILED", "MEDIA_UNAVAILABLE", "IG_RATE_LIMIT", "IG_TEMPORARY", "INTERNAL_ERROR", "MODERATION_REQUIRED"].includes(errorCode)
          && !(cause as Error & { permanent?: boolean }).permanent;
        // The transition updates both outbox and message atomically and rejects stale leases.
        const { data: finished, error: finishError } = await db.rpc("finish_publication_job", {
          p_job_id: job.job_id,
          p_lock_token: job.lock_token,
          p_error_code: errorCode,
          p_retryable: retryable,
        });
        if (finishError || !["retry_scheduled", "failed", "deferred", "stale"].includes(String(finished))) throw new Error("INTERNAL_ERROR");
        if (["retry_scheduled", "deferred"].includes(String(finished))) deferred++;
        else failed++;
        console.error(JSON.stringify({ request_id: rid, job_id: job.job_id, stage: "publication", error_code: errorCode, outcome: finished }));
      }
    }
    console.info(JSON.stringify({ request_id: rid, stage: "publication_batch", processed, deferred, failed, duration_ms: Date.now() - startedAt }));
    return json({ accepted: true, processed, deferred, failed }, 200, cors);
  } catch (cause) { logFailure(rid, "worker", cause); return new Response("Internal error", { status: 500, headers: cors }); }
});
