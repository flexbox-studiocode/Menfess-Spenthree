export type InstagramConfig = { token: string; userId: string; version: string };

const apiUrl = (version: string, path: string) => `https://graph.facebook.com/${version}/${path}`;
const safeError = (status: number, body: unknown) => {
  const code = (body as { error?: { code?: number } })?.error?.code;
  if (status === 401 || code === 190) return "IG_AUTH_REQUIRED";
  if (status === 429 || code === 4 || code === 32) return "IG_RATE_LIMIT";
  if (status >= 500) return "IG_TEMPORARY";
  return "INTERNAL_ERROR";
};

async function request(config: InstagramConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(config.version, path), { ...init, headers: { "content-type": "application/json", Authorization: `Bearer ${config.token}`, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(safeError(response.status, body)); (error as Error & { permanent?: boolean }).permanent = response.status === 401 || response.status === 403 || response.status === 400; throw error; }
  return body as Record<string, unknown>;
}

export async function createContainer(config: InstagramConfig, imageUrl: string, caption: string) {
  return request(config, `${config.userId}/media`, { method: "POST", body: JSON.stringify({ image_url: imageUrl, caption }) });
}
export async function containerStatus(config: InstagramConfig, containerId: string) { return request(config, containerId); }
export async function publishContainer(config: InstagramConfig, containerId: string) { return request(config, `${config.userId}/media_publish`, { method: "POST", body: JSON.stringify({ creation_id: containerId }) }); }
export async function mediaPermalink(config: InstagramConfig, mediaId: string) { return request(config, mediaId + "?fields=permalink"); }
