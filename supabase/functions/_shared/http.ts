const productionOrigins = new Set([
  "https://menfess-spenthree.vercel.app",
  "https://menfess-spenthree-eight.vercel.app",
]);
const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

const configuredOrigins = () => (Deno.env.get("CORS_ORIGIN") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

export const corsForRequest = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin");
  const allowed = new Set([...productionOrigins, ...configuredOrigins().filter((value) => {
    try {
      const url = new URL(value);
      return !value.includes("*") && value === url.origin && (url.protocol === "https:" || localOrigins.has(value));
    } catch { return false; }
  })]);
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
    "vary": "Origin",
  };
  if (origin && allowed.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
};

// Never log error messages/details: upstream errors can contain private payloads.
export const logFailure = (requestId: string, stage: string, cause: unknown) => {
  const value = cause as { name?: unknown; code?: unknown; rpc?: unknown } | null;
  const safeToken = (token: unknown) => typeof token === "string" && /^[A-Za-z0-9_]{1,48}$/.test(token) ? token : undefined;
  console.error(JSON.stringify({ request_id: requestId, stage, error_name: safeToken(value?.name), error_code: safeToken(value?.code), rpc: safeToken(value?.rpc) }));
};

export const json = (body: unknown, status = 200, extra: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

export const error = (code: string, requestId: string, status: number, fields?: Record<string,string>, headers: Record<string,string> = {}) =>
  json({ error: { code, message: code === "NOT_FOUND" ? "Tidak ditemukan." : "Periksa kembali data yang dikirim.", request_id: requestId, ...(fields ? { fields } : {}) } }, status, headers);
