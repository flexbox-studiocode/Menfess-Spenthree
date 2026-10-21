import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, encrypt, hmac, hex } from "../_shared/crypto.ts";
import { cors, error, json } from "../_shared/http.ts";

const categories = new Set(["menfess", "aspirasi", "curhat", "apresiasi"]);
const enc = new TextEncoder();
const code = () => { const b = crypto.getRandomValues(new Uint8Array(16)); return `SPT-${hex(b).toUpperCase()}`; };
const points = (s: string) => [...s].length;
Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return error("VALIDATION_ERROR", rid, 400);
  if (Number(req.headers.get("content-length") ?? 0) > 12000) return error("PAYLOAD_TOO_LARGE", rid, 413);
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "category,content,recipient,request_id,rules_accepted") return error("VALIDATION_ERROR", rid, 400);
    const { request_id, category, content, recipient, rules_accepted } = body;
    const fields: Record<string,string> = {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id ?? "")) fields.request_id = "Invalid request ID.";
    if (!categories.has(category)) fields.category = "Kategori tidak valid.";
    const normalized = typeof content === "string" ? content.normalize("NFC").replace(/\r\n?/g,"\n").trim() : "";
    if (points(normalized) < 10 || points(normalized) > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(normalized)) fields.content = "Isi harus 10–500 karakter.";
    const rec = recipient == null || recipient === "" ? null : typeof recipient === "string" ? recipient.normalize("NFC").trim() : "#";
    if (rec !== null && (points(rec) < 1 || points(rec) > 80 || /[\x00-\x1f\x7f]/u.test(rec))) fields.recipient = "Penerima tidak valid.";
    if (rules_accepted !== true) fields.rules_accepted = "Persetujuan wajib diberikan.";
    if (Object.keys(fields).length) return error("VALIDATION_ERROR", rid, 400, fields);
    const payload = JSON.stringify({ request_id, category, recipient: rec, content: normalized, rules_accepted });
    const trackingSecret = Deno.env.get("TRACKING_HASH_SECRET");
    const payloadSecret = Deno.env.get("PAYLOAD_HASH_SECRET");
    const receiptSecret = Deno.env.get("RECEIPT_ENCRYPTION_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (![trackingSecret, payloadSecret, receiptSecret, serviceKey, supabaseUrl].every((value) => value && value.length >= 32)) throw new Error("Server secrets are not configured");
    const tracking = code(), trackingHash = `v1:${await hmac(trackingSecret, tracking)}`;
    const payloadHash = `v1:${await hmac(payloadSecret, payload)}`;
    const version = "v1";
    const encrypted = await encrypt(receiptSecret, JSON.stringify({ tracking_code: tracking, status: "queued" }), `${request_id}:${version}`);
    const db = createClient(supabaseUrl, serviceKey);
    const { data: rpcData, error: dbError } = await db.rpc("submit_menfess_atomic", { p_request_id: request_id, p_tracking_code_hash: trackingHash, p_category: category, p_recipient: rec, p_content: normalized, p_payload_hash: payloadHash, p_encrypted_response: `\\x${hex(encrypted)}`, p_encryption_key_version: version });
    if (dbError || !rpcData) throw dbError || new Error("Atomic submit returned no data");
    // PostgREST returns a composite RPC result as a one-row array.
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const nested = row?.submit_result ?? row?.submit_menfess_atomic ?? row;
    const data = typeof nested === "string" ? JSON.parse(nested) : nested;
    if (!data?.receipt_payload_hash || !data?.encrypted_response) return error("RECEIPT_EXPIRED", rid, 409);
    if (data.receipt_payload_hash !== payloadHash) return error("IDEMPOTENCY_CONFLICT", rid, 409);
    if (!data.expires_at || new Date(data.expires_at) <= new Date()) return error("RECEIPT_EXPIRED", rid, 409);
    const receipt = JSON.parse(await decrypt(receiptSecret, new Uint8Array(typeof data.encrypted_response === "string" ? Uint8Array.from((data.encrypted_response.replace(/^\\x/, "").match(/.{1,2}/g) ?? []).map((part) => parseInt(part, 16))) : data.encrypted_response), `${request_id}:${data.encryption_key_version}`));
    if (typeof receipt.tracking_code !== "string") throw new Error("Invalid receipt");
    return json({ accepted: true, tracking_code: receipt.tracking_code, status: "queued", message: "Menfess diterima dan sedang diproses. Simpan kode pelacakanmu." }, 202, cors);
  } catch { return error("INTERNAL_ERROR", rid, 500); }
});
