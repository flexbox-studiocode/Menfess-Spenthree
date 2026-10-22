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
    const { data, error: dbError } = await db.from("messages").select("status,published_at,ig_permalink").eq("tracking_code_hash", hash).maybeSingle();
    if (dbError) throw dbError;
    if (!data) return fail("NOT_FOUND", 404);
    const published = data.status === "published";
    return json({ status: data.status, message: published ? "Pesan berhasil dipublikasikan." : "Pesan diterima dan menunggu proses.", published_at: published ? data.published_at : null, ig_permalink: published ? data.ig_permalink : null }, 200, cors);
  } catch (cause) {
    logFailure(rid, stage, cause);
    return fail("INTERNAL_ERROR", 500);
  }
});
