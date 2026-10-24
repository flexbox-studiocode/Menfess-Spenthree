import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsForRequest, error, json, logFailure } from "../_shared/http.ts";
import { addLikeSummary } from "../_shared/likes.ts";

const categories = new Set(["menfess", "aspirasi", "curhat", "apresiasi"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const columns = "public_id,category,recipient,content,status,created_at,published_at,ig_permalink";
type Cursor = { v: 1; category: string | null; created_at: string; public_id: string };

const encodeCursor = (value: Cursor) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const decodeCursor = (raw: string, category: string | null): Cursor | null => {
  try {
    if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    const base64 = raw.replaceAll("-", "+").replaceAll("_", "/");
    const value = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as Cursor;
    if (value?.v !== 1 || value.category !== category || !uuid.test(value.public_id) || typeof value.created_at !== "string") return null;
    const date = new Date(value.created_at);
    if (!Number.isFinite(date.valueOf())) return null;
    return { ...value, created_at: date.toISOString() };
  } catch { return null; }
};

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const cors = corsForRequest(req);
  const fail = (code: string, status: number) => error(code, rid, status, undefined, cors);
  let stage = "validation";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return fail("VALIDATION_ERROR", 400);
  try {
    const params = new URL(req.url).searchParams;
    if ([...params.keys()].some((key) => !["category", "limit", "cursor"].includes(key))) return fail("VALIDATION_ERROR", 400);
    const category = params.get("category");
    if (category !== null && !categories.has(category)) return fail("VALIDATION_ERROR", 400);
    const rawLimit = params.get("limit");
    if (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit)) return fail("VALIDATION_ERROR", 400);
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit > 50) return fail("VALIDATION_ERROR", 400);
    for (const key of ["category", "limit", "cursor"]) if (params.getAll(key).length > 1) return fail("VALIDATION_ERROR", 400);
    const rawCursor = params.get("cursor");
    const cursor = rawCursor === null ? null : decodeCursor(rawCursor, category);
    if (rawCursor !== null && !cursor) return fail("VALIDATION_ERROR", 400);

    stage = "validate_secrets";
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Missing configuration");
    const db = createClient(url, serviceKey);
    stage = "query_feed";
    let query = db.from("timeline_messages").select(columns).order("created_at", { ascending: false }).order("public_id", { ascending: false }).limit(limit + 1);
    if (category) query = query.eq("category", category);
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},public_id.lt.${cursor.public_id})`);
    const { data, error: dbError } = await query;
    if (dbError) throw dbError;
    const rows = (data ?? []).slice(0, limit);
    const voterId = req.headers.get("x-voter-id");
    if (voterId && !uuid.test(voterId)) return fail("VALIDATION_ERROR", 400);
    const enrichedRows = await addLikeSummary(db, rows, voterId);
    const last = rows.at(-1);
    const next = (data?.length ?? 0) > limit && last ? encodeCursor({ v: 1, category, created_at: new Date(last.created_at).toISOString(), public_id: last.public_id }) : null;
    return json({ data: enrichedRows.map((row, index) => ({ ...row, web_status: "visible", delivery_status: rows[index].status })), next_cursor: next }, 200, cors);
  } catch (cause) {
    logFailure(rid, stage, cause);
    return fail("INTERNAL_ERROR", 500);
  }
});
