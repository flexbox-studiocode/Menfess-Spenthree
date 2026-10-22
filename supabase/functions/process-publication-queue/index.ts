import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsForRequest, json, logFailure } from "../_shared/http.ts";
import { createContainer, containerStatus, mediaPermalink, parseContainerStatus, publishContainer } from "../_shared/instagram.ts";
import { assertPublishableModeration, readSafetyConfig, safetyPolicyVersion } from "../_shared/content-safety.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const maxJobs = 3;
const caption = (category: string) => `Menfess Spenthree — ${category}\n\n#MenfessSpenthree #SMPN3Sokaraja`;

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const cors = corsForRequest(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const secret = Deno.env.get("WORKER_CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404, headers: cors });
  if (Deno.env.get("INSTAGRAM_PUBLISH_ENABLED") !== "true") return json({ accepted: true, skipped: "disabled" }, 202, cors);
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("INSTAGRAM_ACCESS_TOKEN"); const userId = Deno.env.get("INSTAGRAM_USER_ID"); const version = Deno.env.get("INSTAGRAM_API_VERSION");
  if (![url, serviceKey, token, userId, version].every(Boolean)) return new Response("Not found", { status: 404, headers: cors });
  const db = createClient(url!, serviceKey!);
  try {
    const safety = readSafetyConfig(key => Deno.env.get(key));
    const policy = await safetyPolicyVersion(safety, { ...safety, minCodePoints: 1, maxCodePoints: 80 }, Deno.env.get("MODERATION_POLICY_REVISION"));
    const { data: control, error: controlError } = await db.from("moderation_control").select("active_policy,publishing_enabled").eq("singleton", true).single();
    if (controlError) throw controlError;
    if (!control?.publishing_enabled || control.active_policy !== policy) return json({ accepted: true, skipped: "moderation_disabled" }, 202, cors);
    const { data: jobs, error } = await db.rpc("claim_publication_jobs", { p_limit: maxJobs, p_lease_seconds: 240 });
    if (error) throw error;
    let processed = 0;
    for (const job of jobs ?? []) {
      try {
        const { data: message, error: readError } = await db.from("messages").select("id,request_id,category,recipient,content,status,rendered_image_path,safety_approved_at,safety_policy_version,safety_content_hash").eq("id", job.message_id).single();
        if (readError || !message) throw readError || new Error("MODERATION_REQUIRED");
        const checkApproval = async () => {
          const { data: approval, error: approvalError } = await db.from("moderation_decisions").select("state,content_hash,policy_version").eq("request_id", message.request_id).single();
          if (approvalError || !approval || !message.safety_approved_at || message.safety_policy_version !== approval.policy_version || message.safety_content_hash !== approval.content_hash) throw new Error("MODERATION_REQUIRED");
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
        const ig = { token: token!, userId: userId!, version: version! };
        let containerId = claimed.container_id;
        if (!containerId) { await lease(); const created = await createContainer(ig, publicUrl.publicUrl, caption(message.category)); containerId = String(created.id); await updateJob({ container_id: containerId, last_stage: "container_created" }); }
        let ready = false;
        for (let i = 0; i < 8; i++) { const status = await containerStatus(ig, containerId!); const state = parseContainerStatus(status); if (state === "FINISHED") { ready = true; break; } if (["ERROR", "EXPIRED"].includes(state)) throw new Error("MEDIA_UNAVAILABLE"); await wait(1500); }
        if (!ready) throw new Error("IG_TEMPORARY");
        await lease();
        const { data: prepared, error: prepareError } = await db.rpc("prepare_ai_publication", { p_job_id: job.job_id, p_lock_token: job.lock_token, p_policy_version: policy });
        if (prepareError || prepared !== true) throw new Error("MODERATION_REQUIRED");
        const published = await publishContainer(ig, containerId!); const mediaId = String(published.id); const permalink = await mediaPermalink(ig, mediaId).then((x) => typeof x.permalink === "string" ? x.permalink : null).catch(() => null);
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
        const known = new Set(["RENDER_FAILED", "MEDIA_UNAVAILABLE", "IG_RATE_LIMIT", "IG_AUTH_REQUIRED", "IG_TEMPORARY", "PUBLISH_AMBIGUOUS", "RETRY_EXHAUSTED", "INTERNAL_ERROR"]);
        const errorCode = known.has(String((cause as Error).message)) ? String((cause as Error).message) : "INTERNAL_ERROR";
        const retryable = ["RENDER_FAILED", "MEDIA_UNAVAILABLE", "IG_RATE_LIMIT", "IG_TEMPORARY", "INTERNAL_ERROR"].includes(errorCode);
        // The transition updates both outbox and message atomically and rejects stale leases.
        await db.rpc("finish_publication_job", {
          p_job_id: job.job_id,
          p_lock_token: job.lock_token,
          p_error_code: errorCode,
          p_retryable: retryable,
        });
      }
    }
    return json({ accepted: true, processed }, 200, cors);
  } catch (cause) { logFailure(rid, "worker", cause); return new Response("Internal error", { status: 500, headers: cors }); }
});
