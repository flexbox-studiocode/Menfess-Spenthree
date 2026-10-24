export type InstagramAuthMode = "instagram_login" | "facebook_login";
// Direct callers retain the legacy host; deployment configuration must select a mode explicitly.
export type InstagramConfig = { token: string; userId: string; version: string; authMode?: InstagramAuthMode };
export type InstagramContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNKNOWN";

type GraphErrorBody = { error?: { code?: number; error_subcode?: number } };

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const HOSTS: Record<InstagramAuthMode, string> = {
  instagram_login: "graph.instagram.com",
  facebook_login: "graph.facebook.com",
};

function validateConfig(config: InstagramConfig): InstagramAuthMode {
  const mode = config.authMode === undefined ? "facebook_login" : config.authMode;
  if ((mode !== "instagram_login" && mode !== "facebook_login") ||
    typeof config.token !== "string" || !config.token.trim() || /[\r\n]/.test(config.token) ||
    typeof config.userId !== "string" || !/^\d{1,64}$/.test(config.userId) ||
    typeof config.version !== "string" || !/^v\d+\.\d+$/.test(config.version)) {
    throw new Error("IG_INVALID_CONFIGURATION");
  }
  return mode;
}

export function readInstagramConfig(getEnv: (name: string) => string | undefined): Required<InstagramConfig> {
  const authMode = getEnv("INSTAGRAM_AUTH_MODE");
  if (authMode !== "instagram_login" && authMode !== "facebook_login") throw new Error("IG_INVALID_CONFIGURATION");
  const config: Required<InstagramConfig> = {
    token: getEnv("INSTAGRAM_ACCESS_TOKEN") ?? "",
    userId: getEnv("INSTAGRAM_USER_ID") ?? "",
    version: getEnv("INSTAGRAM_API_VERSION") ?? "",
    authMode,
  };
  validateConfig(config);
  return config;
}

const apiUrl = (config: InstagramConfig, path: string) => {
  const mode = validateConfig(config);
  return `https://${HOSTS[mode]}/${config.version}/${path}`;
};

const graphErrorCode = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as GraphErrorBody).error;
  return error && typeof error.code === "number" ? error.code : undefined;
};

const safeError = (status: number, body: unknown) => {
  const code = graphErrorCode(body);
  if (status === 401 || code === 102 || code === 190) return "IG_AUTH_REQUIRED";
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) return "IG_RATE_LIMIT";
  if (status >= 500 || code === 2) return "IG_TEMPORARY";
  return "INTERNAL_ERROR";
};

const isPermanent = (status: number, body: unknown) => {
  const mapped = safeError(status, body);
  return mapped === "IG_AUTH_REQUIRED" || (status >= 400 && status < 500 && mapped === "INTERNAL_ERROR");
};

export function parseContainerStatus(body: unknown): InstagramContainerStatus {
  if (!body || typeof body !== "object") return "UNKNOWN";
  const raw = (body as { status_code?: unknown; status?: unknown }).status_code ?? (body as { status?: unknown }).status;
  const status = typeof raw === "string" ? raw.toUpperCase() : "";
  return ["IN_PROGRESS", "FINISHED", "ERROR", "EXPIRED", "PUBLISHED"].includes(status)
    ? status as InstagramContainerStatus
    : "UNKNOWN";
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function request(config: InstagramConfig, path: string, init: RequestInit = {}) {
  const url = apiUrl(config, path);
  let response: Response;
  let bodyJson: Record<string, unknown> | null;
  try {
    const method = (init.method ?? "GET").toString().toUpperCase();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    let body = init.body;
    if (method === "GET" || method === "HEAD") {
      headers.set("authorization", `Bearer ${config.token}`);
    } else {
      const form = new URLSearchParams();
      if (typeof body === "string" || body instanceof URLSearchParams) {
        new URLSearchParams(body.toString()).forEach((value, key) => form.set(key, value));
      }
      form.set("access_token", config.token);
      body = form;
      headers.set("content-type", "application/x-www-form-urlencoded");
    }
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    // Never follow redirects with credentials, and never retry an ambiguous publish here.
    response = await fetch(url, { ...init, method, headers, body, signal, redirect: "error" });
    bodyJson = await readBoundedJson(response);
  } catch {
    throw new Error("IG_TEMPORARY");
  }
  if (!response.ok) {
    const error = new Error(safeError(response.status, bodyJson));
    (error as Error & { permanent?: boolean }).permanent = isPermanent(response.status, bodyJson);
    throw error;
  }
  if (!bodyJson) throw new Error("IG_TEMPORARY");
  return bodyJson;
}

export function createContainer(config: InstagramConfig, imageUrl: string, caption: string, signal?: AbortSignal) {
  return request(config, `${config.userId}/media`, { method: "POST", body: new URLSearchParams({ image_url: imageUrl, caption }), signal });
}
export function containerStatus(config: InstagramConfig, containerId: string, signal?: AbortSignal) { return request(config, `${containerId}?fields=status_code,status`, { signal }); }
export function publishContainer(config: InstagramConfig, containerId: string, signal?: AbortSignal) { return request(config, `${config.userId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: containerId }), signal }); }
export function mediaPermalink(config: InstagramConfig, mediaId: string, signal?: AbortSignal) { return request(config, mediaId + "?fields=permalink", { signal }); }
