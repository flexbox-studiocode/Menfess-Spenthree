import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMessage, readModerationConfig } from "../../supabase/functions/_shared/moderation-provider.ts";
import { assertPublishableModeration, contentFingerprint } from "../../supabase/functions/_shared/content-safety.ts";

const input = { category: "aspirasi", recipient: "OSIS", content: "Tolong tambah tempat sampah di taman." };
const config = { apiKey: "synthetic-test-key", model: "openai/gpt-oss-120b", policyRevision: "school-v1" };
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
const response = (verdict, extra = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(verdict) }, ...extra }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("server moderation transport", () => {
  it.each(["allow", "reject", "uncertain"])("returns a validated %s verdict", async decision => {
    const verdict = { decision, reasons: decision === "allow" ? [] : ["harassment"] };
    const fetcher = vi.fn().mockResolvedValue(response(verdict)); vi.stubGlobal("fetch", fetcher);
    expect(await classifyMessage(input, config, new AbortController().signal)).toEqual(verdict);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(options.body);
    expect(JSON.parse(body.messages[1].content)).toEqual(input);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body).not.toHaveProperty("tools");
  });
  it.each([
    { decision: "allow", reasons: ["harassment"] }, { decision: "reject", reasons: [] },
    { decision: "allow", reasons: [], extra: "yes" }, { decision: "uncertain", reasons: ["unknown"] },
    { decision: "maybe", reasons: [] }, { decision: "allow", reasons: "" },
  ])("refuses inconsistent or untrusted verdict %j", async verdict => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(verdict)));
    await expect(classifyMessage(input, config, new AbortController().signal)).rejects.toThrow();
  });
  it.each([401, 429, 500, 503])("fails closed on upstream HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream detail", { status, headers: { "retry-after": "30" } })));
    await expect(classifyMessage(input, config, new AbortController().signal)).rejects.toThrow("MODERATION_UNAVAILABLE");
  });
  it("rejects truncation even when the JSON is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ decision: "allow", reasons: [] }, { finish_reason: "length" })));
    await expect(classifyMessage(input, config, new AbortController().signal)).rejects.toThrow();
  });
  it("aborts a stalled body after five seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))));
    const result = classifyMessage(input, config, new AbortController().signal);
    const check = expect(result).rejects.toThrow("MODERATION_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(5001); await check;
  });
  it("requires server key, fixed model and explicit positive quotas", () => {
    expect(() => readModerationConfig(() => undefined)).toThrow();
    const env = { GROQ_API_KEY: "test", MODERATION_MODEL: config.model, MODERATION_POLICY_REVISION: "school-v1", MODERATION_REQUESTS_PER_MINUTE: "30", MODERATION_REQUESTS_PER_DAY: "1000", MODERATION_TOKENS_PER_MINUTE: "8000", MODERATION_TOKENS_PER_DAY: "200000" };
    expect(readModerationConfig(key => env[key]).model).toBe(config.model);
    expect(() => readModerationConfig(key => key === "MODERATION_MODEL" ? "arbitrary-model" : env[key])).toThrow();
  });
});
it("binds publication to the exact content and current policy", async () => {
  const contentHash = await contentFingerprint(input);
  await expect(assertPublishableModeration(input, { decision: "allow", contentHash, policyVersion: "policy-1" }, "policy-1")).resolves.toBeUndefined();
  await expect(assertPublishableModeration({ ...input, recipient: "someone else" }, { decision: "allow", contentHash, policyVersion: "policy-1" }, "policy-1")).rejects.toThrow();
  await expect(assertPublishableModeration(input, { decision: "allow", contentHash, policyVersion: "old" }, "policy-1")).rejects.toThrow();
  await expect(assertPublishableModeration(input, { decision: "uncertain", contentHash, policyVersion: "policy-1" }, "policy-1")).rejects.toThrow();
});
