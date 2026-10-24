import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { containerStatus, createContainer, mediaPermalink, publishContainer, readInstagramConfig } from "../../supabase/functions/_shared/instagram.ts";

const config = { token: "secret-fixture-token", userId: "12345", version: "v25.0" };
const environment = {
  INSTAGRAM_ACCESS_TOKEN: config.token,
  INSTAGRAM_USER_ID: config.userId,
  INSTAGRAM_API_VERSION: config.version,
  INSTAGRAM_AUTH_MODE: "instagram_login",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({ id: "67890" }))));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Instagram deployment configuration", () => {
  it.each(["instagram_login", "facebook_login"])("reads explicit %s credentials", authMode => {
    expect(readInstagramConfig(name => ({ ...environment, INSTAGRAM_AUTH_MODE: authMode })[name])).toEqual({ ...config, authMode });
  });

  it.each([
    ["INSTAGRAM_AUTH_MODE", undefined], ["INSTAGRAM_AUTH_MODE", "wrong"],
    ["INSTAGRAM_ACCESS_TOKEN", ""], ["INSTAGRAM_ACCESS_TOKEN", "secret\nheader"],
    ["INSTAGRAM_USER_ID", "https://evil.invalid"], ["INSTAGRAM_API_VERSION", "v25.0/other"],
  ])("rejects invalid %s without exposing the value", (name, value) => {
    expect(() => readInstagramConfig(key => ({ ...environment, [name]: value })[key])).toThrow("IG_INVALID_CONFIGURATION");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Instagram transport", () => {
  it.each([
    ["instagram_login", "graph.instagram.com"],
    ["facebook_login", "graph.facebook.com"],
    [undefined, "graph.facebook.com"],
  ])("routes %s only to its fixed host and sends create fields as form data", async (authMode, host) => {
    const imageUrl = "https://media.invalid/card.jpg?x=a&y=b";
    const caption = "A caption & + unicode: terima kasih";
    await expect(createContainer({ ...config, authMode }, imageUrl, caption)).resolves.toEqual({ id: "67890" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://${host}/v25.0/12345/media`);
    expect(url).not.toContain(config.token);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers.get("authorization")).toBeNull();
    expect(init.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(init.body)).toEqual({ image_url: imageUrl, caption, access_token: config.token });
    expect(init.signal.aborted).toBe(false);
  });

  it("sends only the creation ID and token on publish", async () => {
    await publishContainer({ ...config, authMode: "instagram_login" }, "67890");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://graph.instagram.com/v25.0/12345/media_publish");
    expect(init.method).toBe("POST");
    expect(Object.fromEntries(init.body)).toEqual({ creation_id: "67890", access_token: config.token });
  });

  it.each([
    [containerStatus, "status_code,status"], [mediaPermalink, "permalink"],
  ])("authenticates GET with a bearer header and explicit fields", async (operation, fields) => {
    await operation({ ...config, authMode: "instagram_login" }, "67890");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://graph.instagram.com/v25.0/67890?fields=${fields}`);
    expect(init.method).toBe("GET");
    expect(init.headers.get("authorization")).toBe(`Bearer ${config.token}`);
    expect(init.headers.get("accept")).toBe("application/json");
    expect(init.body).toBeUndefined();
    expect(url).not.toContain(config.token);
  });

  it("uses a 15 second deadline and combines an external cancellation signal", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const external = new AbortController();
    await mediaPermalink(config, "67890", external.signal);
    const signal = fetch.mock.calls[0][1].signal;
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(signal).not.toBe(external.signal);
    expect(signal.aborted).toBe(false);
    external.abort();
    expect(signal.aborted).toBe(true);
  });

  it("propagates deadline abort and sanitizes timeout errors without retrying publish", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    fetch.mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error(`timeout ${config.token}`)), { once: true });
    }));
    const result = publishContainer(config, "67890", new AbortController().signal);
    const assertion = expect(result).rejects.toThrow(/^IG_TEMPORARY$/);
    deadline.abort();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sanitizes network failures without retrying publish", async () => {
    fetch.mockRejectedValueOnce(new Error(`request failed ${config.token}`));
    await expect(publishContainer(config, "67890")).rejects.toThrow(/^IG_TEMPORARY$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, undefined, "IG_AUTH_REQUIRED", true],
    [400, 190, "IG_AUTH_REQUIRED", true],
    [429, undefined, "IG_RATE_LIMIT", false],
    [400, 4, "IG_RATE_LIMIT", false],
    [503, undefined, "IG_TEMPORARY", false],
    [400, 2, "IG_TEMPORARY", false],
    [400, 100, "INTERNAL_ERROR", true],
  ])("maps HTTP %s / code %s without disclosing provider messages", async (status, code, message, permanent) => {
    fetch.mockResolvedValueOnce(json({ error: { code, message: `provider body ${config.token}` } }, status));
    await expect(publishContainer(config, "67890")).rejects.toMatchObject({ message, permanent });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["not JSON", "[]", "null", '"secret-fixture-token"', "x".repeat(65 * 1024)])("rejects malformed, non-object or oversized successful responses safely", async body => {
    fetch.mockResolvedValueOnce(new Response(body));
    await expect(mediaPermalink(config, "67890")).rejects.toThrow(/^IG_TEMPORARY$/);
  });

  it("cancels reading as soon as the response exceeds the byte limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(65 * 1024)); },
      cancel,
    });
    fetch.mockResolvedValueOnce(new Response(stream));
    await expect(mediaPermalink(config, "67890")).rejects.toThrow(/^IG_TEMPORARY$/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps safe HTTP error mapping even if the body is invalid JSON", async () => {
    fetch.mockResolvedValueOnce(new Response(`not JSON ${config.token}`, { status: 401 }));
    await expect(mediaPermalink(config, "67890")).rejects.toMatchObject({ message: "IG_AUTH_REQUIRED", permanent: true });
  });

  it("rejects arbitrary auth modes before any network call", async () => {
    await expect(mediaPermalink({ ...config, authMode: "https://evil.invalid" }, "67890")).rejects.toThrow(/^IG_INVALID_CONFIGURATION$/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
