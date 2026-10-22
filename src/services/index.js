import { readSupabaseConfig } from "../lib/supabaseConfig.js";

const MAX_PAYLOAD_BYTES = 16 * 1024;

function assertResponseShape(data) {
  if (!data || typeof data !== "object") throw new Error("Respons backend tidak valid.");
  return data;
}

async function readErrorDetail(error) {
  const context = error?.context;
  if (!context) return null;
  try {
    if (typeof context.json === "function") return await context.json();
    if (typeof context.text === "function") {
      const text = await context.text();
      return JSON.parse(text);
    }
  } catch { return null; }
  return null;
}

function userError(code, status) {
  if (code === "CONTENT_UNSAFE") return "Pesan belum dapat dikirim. Periksa kata-kata, informasi pribadi, atau isi yang dapat menyakiti orang lain.";
  if (code === "MODERATION_UNAVAILABLE") return "Penyimpanan pesan sedang tidak tersedia. Pesan belum dikirim. Coba lagi nanti.";
  if (code === "QUEUE_FULL") return "Antrean pesan sedang penuh. Draf tetap tersimpan; coba kirim lagi nanti.";
  if (code === "VALIDATION_ERROR") return "Periksa kembali kategori, isi pesan, penerima, dan persetujuan.";
  if (code === "IDEMPOTENCY_CONFLICT") return "Request ID ini sudah dipakai untuk isi pesan berbeda. Pertahankan draf atau buat request baru.";
  if (code === "RECEIPT_EXPIRED") return "Batas retry request ini sudah berakhir. Buat pesan baru untuk mengirim ulang.";
  if (code === "NOT_FOUND") return "Kode tracking tidak ditemukan.";
  if (status === 429) return "Terlalu banyak permintaan. Coba lagi nanti.";
  if ([502, 503, 504].includes(status)) return "Gateway sedang tidak tersedia. Coba lagi dengan request yang sama.";
  if (status >= 500) return "Server sedang mengalami gangguan. Coba lagi dengan request yang sama.";
  return "Permintaan belum dapat diproses. Coba lagi dengan request yang sama.";
}

async function invoke(name, body, timeoutMs = 15000) {
  const { getSupabaseClient } = await import("../lib/supabase.js");
  const client = getSupabaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_PAYLOAD_BYTES) throw new Error("Payload terlalu besar.");
    const { data, error } = await client.functions.invoke(name, { body, signal: controller.signal });
    if (error) {
      if (error.name === "AbortError" || controller.signal.aborted) throw new Error("Permintaan belum terkonfirmasi. Gunakan request yang sama untuk mencoba lagi.");
      const detail = await readErrorDetail(error);
      const err = new Error(userError(detail?.error?.code, error.context?.status));
      err.code = detail?.error?.code;
      err.status = error.context?.status;
      err.requestId = detail?.error?.request_id;
      throw err;
    }
    return assertResponseShape(data);
  } catch (error) {
    if (error instanceof TypeError || error?.message?.toLowerCase().includes("failed to fetch")) throw new Error("Koneksi atau CORS gagal. Pastikan URL Supabase dan origin frontend benar.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export function submitMenfess(payload) { return invoke("submit-menfess", payload, 20000); }
export function trackMenfess(trackingCode) { return invoke("track-menfess", { tracking_code: trackingCode }); }

async function fetchPublicFunction(name, params, signal) {
  const { url, key } = readSupabaseConfig();
  const endpoint = new URL(`/functions/v1/${name}`, url);
  Object.entries(params).forEach(([field, value]) => {
    if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(field, String(value));
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(endpoint, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: controller.signal });
    let body;
    try { body = await response.json(); } catch { throw new Error("Respons backend tidak valid."); }
    if (!response.ok) {
      const err = new Error(body?.error?.code === "NOT_FOUND" ? "Menfess tidak ditemukan atau belum diterbitkan." : userError(body?.error?.code, response.status));
      err.code = body?.error?.code;
      err.status = response.status;
      throw err;
    }
    return assertResponseShape(body);
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Permintaan dibatalkan.", "AbortError");
    if (controller.signal.aborted) throw new Error("Permintaan terlalu lama. Coba lagi.");
    if (error instanceof TypeError || error?.message?.toLowerCase().includes("failed to fetch")) throw new Error("Koneksi atau CORS gagal. Coba lagi.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function fetchPublicFeed({ category, limit = 20, cursor, signal } = {}) {
  return fetchPublicFunction("public-feed", { category, limit, cursor }, signal);
}
export function fetchPublicMenfess(publicId, signal) {
  return fetchPublicFunction("public-menfess", { id: publicId }, signal);
}

export const DRAFT_KEY = "menfess-spenthree-draft";
export function createRequestId() { return crypto.randomUUID(); }
export function saveDraft(draft) {
  const previous = readDraft();
  const canonical = value => JSON.stringify({ category: value.category, content: value.content?.replace(/\r\n?/g, "\n").normalize("NFC").trim(), recipient: value.recipient?.normalize("NFC").trim() || null, rules_accepted: value.rules_accepted });
  const next = { ...draft };
  if (previous?.request_id && previous.request_id === next.request_id && canonical(previous) !== canonical(next)) delete next.request_id;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}
export function readDraft() { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } }
export function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }
