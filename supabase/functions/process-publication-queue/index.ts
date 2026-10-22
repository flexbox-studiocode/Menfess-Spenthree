import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsForRequest, json, logFailure } from "../_shared/http.ts";
import { createContainer, containerStatus, mediaPermalink, publishContainer } from "../_shared/instagram.ts";

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
    const { data: jobs, error } = await db.rpc("claim_publication_jobs", { p_limit: maxJobs, p_lease_seconds: 240 });
    if (error) throw error;
    let processed = 0;
    for (const job of jobs ?? []) {
      try {
        const { data: message, error: readError } = await db.from("messages").select("id,category,recipient,content,rendered_image_path").eq("id", job.message_id).single();
        if (readError) throw readError;
        // Renderer is deployed separately; its secret never reaches the browser.
        const rendererUrl = Deno.env.get("RENDERER_URL"); const rendererSecret = Deno.env.get("RENDERER_SECRET");
        if (!rendererUrl || !rendererSecret) throw new Error("RENDER_FAILED");
        const rendered = await fetch(rendererUrl, { method: "POST", headers: { authorization: `Bearer ${rendererSecret}`, "content-type": "application/json" }, body: JSON.stringify(message) });
        if (!rendered.ok) throw new Error("RENDER_FAILED");
        const objectPath = `${crypto.randomUUID()}.jpg`;
        const image = await rendered.arrayBuffer();
        const { error: uploadError } = await db.storage.from("instagram-publications").upload(objectPath, image, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw new Error("RENDER_FAILED");
        const { data: publicUrl } = db.storage.from("instagram-publications").getPublicUrl(objectPath);
        await db.from("messages").update({ status: "publishing", rendered_image_path: objectPath }).eq("id", job.message_id);
        const ig = { token: token!, userId: userId!, version: version! };
        let containerId = job.container_id;
        if (!containerId) { const created = await createContainer(ig, publicUrl.publicUrl, caption(message.category)); containerId = String(created.id); await db.from("publication_jobs").update({ container_id: containerId, last_stage: "container_created" }).eq("id", job.job_id).eq("lock_token", job.lock_token); }
        let ready = false;
        for (let i = 0; i < 8; i++) { const status = await containerStatus(ig, containerId!); const state = String(status.status_code ?? status.status ?? ""); if (state === "FINISHED") { ready = true; break; } if (["ERROR", "EXPIRED"].includes(state)) throw new Error("MEDIA_UNAVAILABLE"); await wait(1500); }
        if (!ready) throw new Error("IG_TEMPORARY");
        const published = await publishContainer(ig, containerId!); const mediaId = String(published.id); const permalink = await mediaPermalink(ig, mediaId).then((x) => typeof x.permalink === "string" ? x.permalink : null).catch(() => null);
        await db.from("messages").update({ status: "published", ig_media_id: mediaId, ig_permalink: permalink, published_at: new Date().toISOString() }).eq("id", job.message_id);
        await db.from("publication_jobs").update({ status: "completed", locked_at: null, lease_expires_at: null, lock_token: null, last_stage: "completed" }).eq("id", job.job_id).eq("lock_token", job.lock_token);
        processed++;
      } catch (cause) {
        logFailure(rid, "job", cause);
        const known = new Set(["RENDER_FAILED", "MEDIA_UNAVAILABLE", "IG_RATE_LIMIT", "IG_AUTH_REQUIRED", "IG_TEMPORARY", "PUBLISH_AMBIGUOUS", "RETRY_EXHAUSTED", "INTERNAL_ERROR"]);
        const errorCode = known.has(String((cause as Error).message)) ? String((cause as Error).message) : "INTERNAL_ERROR";
        await db.from("messages").update({ status: "failed" }).eq("id", job.message_id).in("status", ["processing", "publishing"]);
        await db.from("publication_jobs").update({ status: "failed", last_error_code: errorCode, locked_at: null, lease_expires_at: null, lock_token: null }).eq("id", job.job_id).eq("lock_token", job.lock_token);
      }
    }
    return json({ accepted: true, processed }, 200, cors);
  } catch (cause) { logFailure(rid, "worker", cause); return new Response("Internal error", { status: 500, headers: cors }); }
});
