import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmac } from "../_shared/crypto.ts";
import { corsForRequest, error, json, logFailure } from "../_shared/http.ts";
Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const cors = corsForRequest(req);
  const fail = (code: string, status: number) => error(code, rid, status, undefined, cors);
  let stage = "validation";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail("VALIDATION_ERROR", 400);
  try {
    const body = await req.json();
    if (!body || typeof body.tracking_code !== "string" || Object.keys(body).length !== 1 || !/^SPT-[A-F0-9]{32}$/.test(body.tracking_code)) return fail("VALIDATION_ERROR", 400);
    stage = "validate_secrets";
    const secret = Deno.env.get("TRACKING_HASH_SECRET");
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || secret.length < 32 || !url || !serviceKey) throw new Error("Missing configuration");
    stage = "hash_tracking";
    const hash = `v1:${await hmac(secret, body.tracking_code)}`;
    const db = createClient(url, serviceKey);
    stage = "lookup_tracking";
    const { data, error: dbError } = await db.from("messages").select("id,request_id,public_id,status,web_status,web_published_at,published_at,ig_permalink,safety_content_hash").eq("tracking_code_hash", hash).maybeSingle();
    if (dbError) throw dbError;
    if (!data) {
      // Keep tracking receipts created by the legacy private intake pipeline.
      const pending = await db.rpc("track_moderation_intake", { p_tracking_code_hash: hash });
      if (pending.error) throw pending.error;
      const intake = Array.isArray(pending.data) ? pending.data[0] : pending.data;
      if (!intake) return fail("NOT_FOUND", 404);
      return json({ status: intake.status, web_status: "hidden", moderation_status: intake.status === "blocked" ? "blocked" : "pending", delivery_status: null,
        message: intake.status === "blocked" ? "Pesan tidak dapat diterbitkan." : "Pesan tersimpan dan menunggu pemeriksaan. Belum tampil di website atau Instagram.", published_at: null, ig_permalink: null }, 200, cors);
    }
    stage = "lookup_moderation";
    const [decision, job, policy] = await Promise.all([
      db.from("moderation_decisions").select("state,policy_version,content_hash,payload_hash").eq("request_id", data.request_id).maybeSingle(),
      db.from("message_moderation_jobs").select("state,payload_hash").eq("message_id", data.id).maybeSingle(),
      db.from("moderation_control").select("active_policy").eq("singleton", true).maybeSingle(),
    ]);
    if (decision.error || job.error || policy.error) throw decision.error || job.error || policy.error;
    const currentDecision = policy.data?.active_policy && decision.data?.policy_version === policy.data.active_policy
      && decision.data?.content_hash === data.safety_content_hash
      && (!job.data?.payload_hash || decision.data?.payload_hash === job.data.payload_hash);
    const moderation = job.data?.state === "blocked" || (currentDecision && ["reject", "uncertain"].includes(decision.data?.state)) ? "blocked"
      : currentDecision && decision.data?.state === "allow" && (!job.data || job.data.state === "approved") ? "approved" : "pending";
    const visible = data.web_status === "visible";
    const published = data.status === "published";
    return json({ status: data.status, web_status: data.web_status, moderation_status: moderation, delivery_status: data.status,
      message: visible ? (published ? "Pesan tampil di website dan telah diterbitkan ke Instagram." : "Pesan tampil di website. Publikasi Instagram diproses terpisah.") : "Pesan tidak tampil di website.",
      ...(visible ? { public_id: data.public_id } : {}), web_published_at: visible ? data.web_published_at : null,
      published_at: published ? data.published_at : null, ig_permalink: published ? data.ig_permalink : null }, 200, cors);
  } catch (cause) {
    logFailure(rid, stage, cause);
    return fail("INTERNAL_ERROR", 500);
  }
});
