export type InstagramConfig = { token: string; userId: string; version: string };
export type InstagramContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "UNKNOWN";

type GraphErrorBody = { error?: { code?: number; error_subcode?: number } };

const apiUrl = (version: string, path: string) => {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("IG_INVALID_CONFIGURATION");
  return `https://graph.facebook.com/${version}/${path}`;
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
  return ["IN_PROGRESS", "FINISHED", "ERROR", "EXPIRED"].includes(status)
    ? status as InstagramContainerStatus
    : "UNKNOWN";
}

async function request(config: InstagramConfig, path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toString().toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  let url = apiUrl(config.version, path);
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
  const response = await fetch(url, { ...init, method, headers, body });
  const bodyJson = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(safeError(response.status, bodyJson));
    (error as Error & { permanent?: boolean }).permanent = isPermanent(response.status, bodyJson);
    throw error;
  }
  return (bodyJson && typeof bodyJson === "object" ? bodyJson : {}) as Record<string, unknown>;
}

export function createContainer(config: InstagramConfig, imageUrl: string, caption: string) {
  return request(config, `${config.userId}/media`, { method: "POST", body: new URLSearchParams({ image_url: imageUrl, caption }) });
}
export function containerStatus(config: InstagramConfig, containerId: string) { return request(config, `${containerId}?fields=status_code,status`); }
export function publishContainer(config: InstagramConfig, containerId: string) { return request(config, `${config.userId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: containerId }) }); }
export function mediaPermalink(config: InstagramConfig, mediaId: string) { return request(config, mediaId + "?fields=permalink"); }
