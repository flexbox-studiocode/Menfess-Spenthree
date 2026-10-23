import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, encrypt, hmac, hex } from "../_shared/crypto.ts";
import { corsForRequest, error, json, logFailure } from "../_shared/http.ts";
import { evaluateContentSafety, readSafetyConfig } from "../_shared/content-safety.ts";
import { ModerationUnavailable } from "../_shared/moderation-provider.ts";

const categories = new Set(["menfess", "aspirasi", "curhat", "apresiasi"]);
const enc = new TextEncoder();
const code = () => { const b = crypto.getRandomValues(new Uint8Array(16)); return `SPT-${hex(b).toUpperCase()}`; };
const points = (s: string) => [...s].length;
Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  const cors = corsForRequest(req);
  const fail = (code: string, status: number, fields?: Record<string, string>) => error(code, rid, status, fields, cors);
  let stage = "validation";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail("VALIDATION_ERROR", 400);
  if (Number(req.headers.get("content-length") ?? 0) > 12000) return fail("PAYLOAD_TOO_LARGE", 413);
  try {
    const rawBody = await req.text();
    if (enc.encode(rawBody).byteLength > 12000) return fail("PAYLOAD_TOO_LARGE", 413);
    const body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "category,content,recipient,request_id,rules_accepted") return fail("VALIDATION_ERROR", 400);
    const { request_id, category, content, recipient, rules_accepted } = body;
    const fields: Record<string,string> = {};
    if (typeof request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id)) fields.request_id = "Invalid request ID.";
    if (!categories.has(category)) fields.category = "Kategori tidak valid.";
    const normalized = typeof content === "string" ? content.normalize("NFC").replace(/\r\n?/g,"\n").trim() : "";
    if (points(normalized) < 10 || points(normalized) > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(normalized)) fields.content = "Isi harus 10–500 karakter.";
    const rec = recipient == null || recipient === "" ? null : typeof recipient === "string" ? recipient.normalize("NFC").trim() : "#";
    if (recipient != null && typeof recipient !== "string") fields.recipient = "Penerima tidak valid.";
    if (rec !== null && (points(rec) < 1 || points(rec) > 80 || /[\x00-\x1f\x7f]/u.test(rec))) fields.recipient = "Penerima tidak valid.";
    if (rules_accepted !== true) fields.rules_accepted = "Persetujuan wajib diberikan.";
    if (Object.keys(fields).length) return fail("VALIDATION_ERROR", 400, fields);
    const payload = JSON.stringify({ request_id, category, recipient: rec, content: normalized, rules_accepted });
    stage = "validate_secrets";
    const trackingSecret = Deno.env.get("TRACKING_HASH_SECRET");
    const payloadSecret = Deno.env.get("PAYLOAD_HASH_SECRET");
    const receiptSecret = Deno.env.get("RECEIPT_ENCRYPTION_SECRET");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (![trackingSecret, payloadSecret, receiptSecret, serviceKey, supabaseUrl].every((value) => value && value.length >= 32)) throw new Error("Server secrets are not configured");
    const payloadHash = `v1:${await hmac(payloadSecret!, payload)}`;
    const db = createClient(supabaseUrl!, serviceKey!);
    const call = async (name: string, params: Record<string, unknown>) => {
      const { data, error: dbError } = await db.rpc(name, params);
      if (dbError || data == null) {
        const failure = new Error("Database RPC failed") as Error & { code?: string; rpc?: string };
        failure.name = "DatabaseRpcError";
        failure.code = dbError?.code;
        failure.rpc = name;
        throw failure;
      }
      return Array.isArray(data) ? data[0] : data;
    };
    stage = "moderation_replay";
    const existing = await call("lookup_submit_receipt", { p_request_id: request_id, p_payload_hash: payloadHash });
    if (existing.kind === "conflict") return fail("IDEMPOTENCY_CONFLICT", 409);
    if (existing.kind === "expired") return fail("RECEIPT_EXPIRED", 409);
    const reply = async (data: Record<string, unknown>) => {
      if (!data?.receipt_payload_hash || !data?.encrypted_response) return fail("RECEIPT_EXPIRED", 409);
      if (data.receipt_payload_hash !== payloadHash) return fail("IDEMPOTENCY_CONFLICT", 409);
      if (!data.expires_at || new Date(String(data.expires_at)) <= new Date()) return fail("RECEIPT_EXPIRED", 409);
      stage = "decrypt_receipt";
      const encoded = data.encrypted_response;
      const bytes = typeof encoded === "string" ? Uint8Array.from((encoded.replace(/^\\x/, "").match(/.{1,2}/g) ?? []).map(part => parseInt(part, 16))) : new Uint8Array(encoded as number[]);
      const receipt = JSON.parse(await decrypt(receiptSecret!, bytes, `${request_id}:${data.encryption_key_version}`));
      if (typeof receipt.tracking_code !== "string" || !["queued", "pending_moderation"].includes(receipt.status)) throw new Error("Invalid receipt");
      return json({ accepted: true, tracking_code: receipt.tracking_code, status: receipt.status, message: "Pesan tersimpan. Pemeriksaan otomatis berjalan di belakang layar. Simpan kode pelacakanmu." }, 202, cors);
    };
    if (existing.kind === "replay") return await reply({ ...existing, receipt_payload_hash: existing.payload_hash });
    if (existing.kind !== "missing") throw new ModerationUnavailable();
    stage = "content_safety";
    const safetyConfig = readSafetyConfig((key) => Deno.env.get(key));
    const recipientConfig = { ...safetyConfig, minCodePoints: 1, maxCodePoints: 80 };
    const [contentSafety, recipientSafety] = await Promise.all([
      evaluateContentSafety(normalized, safetyConfig),
      rec === null ? Promise.resolve(null) : evaluateContentSafety(rec, recipientConfig),
    ]);
    if (!contentSafety.approved || recipientSafety?.approved === false) {
      return fail("CONTENT_UNSAFE", 422, {
        ...(!contentSafety.approved ? { content: "Isi mengandung informasi kontak atau konten yang dilarang." } : {}),
        ...(recipientSafety?.approved === false ? { recipient: "Penerima mengandung informasi kontak atau konten yang dilarang." } : {}),
      });
    }
    stage = "encrypt_receipt";
    const tracking = code(), trackingHash = `v1:${await hmac(trackingSecret!, tracking)}`;
    const version = "v1";
    const encrypted = await encrypt(receiptSecret!, JSON.stringify({ tracking_code: tracking, status: "pending_moderation" }), `${request_id}:${version}`);
    stage = "rpc_intake";
    const result = await call("enqueue_moderation_intake", { p_request_id: request_id, p_tracking_code_hash: trackingHash,
      p_input: { category, recipient: rec, content: normalized }, p_payload_hash: payloadHash,
      p_encrypted_response: `\\x${hex(encrypted)}`, p_encryption_key_version: version });
    if (result.kind === "conflict") return fail("IDEMPOTENCY_CONFLICT", 409);
    if (result.kind === "expired") return fail("RECEIPT_EXPIRED", 409);
    if (result.kind === "full") return fail("QUEUE_FULL", 503);
    if (!["accepted", "replay"].includes(result.kind)) throw new ModerationUnavailable();
    return await reply({ ...result, receipt_payload_hash: result.payload_hash });
  } catch (cause) {
    logFailure(rid, stage, cause);
    if (cause instanceof ModerationUnavailable) return json({ error: { code: "MODERATION_UNAVAILABLE", message: "Penyimpanan pesan sedang tidak tersedia. Pesan belum dikirim.", request_id: rid } }, 503, { ...cors, "retry-after": String(cause.retryAfter) });
    return fail("INTERNAL_ERROR", 500);
  }
});
