import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsForRequest, error, json, logFailure } from "../_shared/http.ts";
import { addLikeSummary } from "../_shared/likes.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const columns = "public_id,category,recipient,content,status,created_at,published_at,ig_permalink";
Deno.serve(async (req) => {
  const rid = crypto.randomUUID(); const cors = corsForRequest(req); const fail = (code: string, status: number) => error(code, rid, status, undefined, cors); let stage = "validation";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return fail("VALIDATION_ERROR", 400);
  try {
    const params = new URL(req.url).searchParams;
    if ([...params.keys()].some((key) => key !== "id") || params.getAll("id").length !== 1 || !uuid.test(params.get("id") ?? "")) return fail("VALIDATION_ERROR", 400);
    stage = "validate_secrets"; const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !serviceKey) throw new Error("Missing configuration");
    stage = "query_detail"; const db = createClient(url, serviceKey); const { data, error: dbError } = await db.from("timeline_messages").select(columns).eq("public_id", params.get("id")).maybeSingle();
    if (dbError) throw dbError; if (!data) return fail("NOT_FOUND", 404);
    const voterId = req.headers.get("x-voter-id"); if (voterId && !uuid.test(voterId)) return fail("VALIDATION_ERROR", 400);
    const [enriched] = await addLikeSummary(db, [data], voterId); return json({ data: { ...enriched, web_status: "visible", delivery_status: data.status } }, 200, cors);
  } catch (cause) { logFailure(rid, stage, cause); return fail("INTERNAL_ERROR", 500); }
});
