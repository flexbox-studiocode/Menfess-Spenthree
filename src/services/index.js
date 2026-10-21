import { getSupabaseClient } from "../lib/supabase.js";

const MAX_PAYLOAD_BYTES = 16 * 1024;

function assertResponseShape(data) {
  if (!data || typeof data !== "object") throw new Error("Respons backend tidak valid.");
  return data;
}

async function invoke(name, body, timeoutMs = 15000) {
  const client = getSupabaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error("Payload terlalu besar.");
    }
    const { data, error } = await client.functions.invoke(name, { body, signal: controller.signal });
    if (error) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        throw new Error("Permintaan belum terkonfirmasi. Gunakan request yang sama untuk mencoba lagi.");
      }
      const context = error.context;
      const detail = context?.json ? await context.json().catch(() => null) : null;
      const message = detail?.error?.message || "Permintaan belum dapat diproses.";
      const err = new Error(message);
      err.code = detail?.error?.code;
      err.status = context?.status;
      throw err;
    }
    return assertResponseShape(data);
  } finally { clearTimeout(timeout); }
}

export function submitMenfess(payload) { return invoke("submit-menfess", payload, 20000); }
export function trackMenfess(trackingCode) { return invoke("track-menfess", { tracking_code: trackingCode }); }

export const DRAFT_KEY = "menfess-spenthree-draft";
export function createRequestId() {
  return crypto.randomUUID();
}
export function saveDraft(draft) { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}
export function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }
