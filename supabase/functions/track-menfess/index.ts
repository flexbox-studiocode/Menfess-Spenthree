import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmac } from "../_shared/crypto.ts";
import { cors, error, json } from "../_shared/http.ts";
Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return error("VALIDATION_ERROR", rid, 400);
  try {
    const body = await req.json();
    if (!body || typeof body.tracking_code !== "string" || Object.keys(body).length !== 1 || !/^SPT-[A-F0-9]{32}$/.test(body.tracking_code)) return error("VALIDATION_ERROR", rid, 400);
    const hash = `v1:${await hmac(Deno.env.get("TRACKING_HASH_SECRET")!, body.tracking_code)}`;
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error: dbError } = await db.from("messages").select("status,published_at,ig_permalink").eq("tracking_code_hash", hash).maybeSingle();
    if (dbError || !data) return error("NOT_FOUND", rid, 404);
    const published = data.status === "published";
    return json({ status: data.status, message: published ? "Pesan berhasil dipublikasikan." : "Pesan diterima dan menunggu proses.", published_at: published ? data.published_at : null, ig_permalink: published ? data.ig_permalink : null }, 200, cors);
  } catch { return error("INTERNAL_ERROR", rid, 500); }
});
