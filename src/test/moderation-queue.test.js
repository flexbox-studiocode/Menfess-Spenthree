// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: mocks.createClient }));
let env, handler, rpc, job;
const secret = "synthetic-worker-secret-".repeat(2);
const request = (authorization = `Bearer ${secret}`, method = "POST") => new Request("https://edge.example/worker", { method, headers: { authorization } });
beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: key => env[key] }, serve: vi.fn() });
  await import("../../supabase/functions/process-moderation-queue/index.ts");
  handler = globalThis.Deno.serve.mock.calls[0][0];
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.restoreAllMocks();
  env = { MODERATION_WORKER_SECRET: secret, SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    GROQ_API_KEY: "synthetic-key", MODERATION_MODEL: "openai/gpt-oss-120b", MODERATION_POLICY_REVISION: "school-v1",
    MODERATION_REQUESTS_PER_MINUTE: "30", MODERATION_REQUESTS_PER_DAY: "1000", MODERATION_TOKENS_PER_MINUTE: "8000", MODERATION_TOKENS_PER_DAY: "200000" };
  job = { request_id: crypto.randomUUID(), lease_token: crypto.randomUUID(), payload_hash: `v1:${"a".repeat(64)}`,
    input: { category: "aspirasi", recipient: null, content: "Tolong tambah buku di perpustakaan." } };
  let claimed = false;
  rpc = vi.fn(async name => {
    if (name === "claim_message_moderation_jobs") return { data: [] };
    if (name === "claim_moderation_intake") { const result = claimed ? [] : [job]; claimed = true; return { data: result }; }
    if (name === "reserve_moderation") return { data: { kind: "acquired", lease_token: "moderation-lease" } };
    return { data: true };
  });
  mocks.createClient.mockReset().mockReturnValue({ rpc });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ decision: "allow", reasons: [] }) } }] }))));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
const override = (name, data) => {
  const original = rpc.getMockImplementation();
  rpc.mockImplementation((fn, params) => fn === name ? { data } : original(fn, params));
};
it("requires a server secret and POST before DB/provider access", async () => {
  expect((await handler(request("Bearer wrong"))).status).toBe(404);
  expect((await handler(request(`Bearer ${secret}`, "GET"))).status).toBe(404);
  delete env.MODERATION_WORKER_SECRET;
  expect((await handler(request())).status).toBe(404);
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["allow", "reject", "uncertain"])("settles %s only after the durable verdict is stored", async decision => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ decision, reasons: decision === "allow" ? [] : ["harassment"] }) } }] })));
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ processed: 1 });
  expect(rpc).toHaveBeenCalledWith("settle_moderation_intake", expect.objectContaining({ p_request_id: job.request_id, p_lease_token: job.lease_token, p_decision: decision }));
  const names = rpc.mock.calls.map(([name]) => name);
  expect(names.indexOf("finish_moderation")).toBeLessThan(names.indexOf("settle_moderation_intake"));
});
it.each(["quota", "provider", "stale", "policy"])("retains private intake and retries after %s failure", async failure => {
  if (failure === "quota") override("reserve_moderation_quota", false);
  if (failure === "provider") fetch.mockRejectedValue(new Error("private provider error"));
  if (failure === "stale") override("finish_moderation", false);
  if (failure === "policy") override("reserve_moderation", { kind: "unavailable" });
  const response = await handler(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ processed: 0, deferred: true });
  expect(rpc).toHaveBeenCalledWith("release_moderation_intake", { p_request_id: job.request_id, p_lease_token: job.lease_token, p_retry_after: 60 });
  expect(rpc.mock.calls.some(([name]) => name === "settle_moderation_intake")).toBe(false);
  if (failure !== "policy") expect(rpc).toHaveBeenCalledWith("release_moderation", expect.objectContaining({ p_lease_token: "moderation-lease" }));
  if (["quota", "policy"].includes(failure)) expect(fetch).not.toHaveBeenCalled();
});
it("resumes an already stored verdict without another provider request", async () => {
  override("reserve_moderation", { kind: "cached", decision: "allow" });
  expect((await handler(request())).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("settle_moderation_intake", expect.objectContaining({ p_decision: "allow" }));
});
it("rechecks local policy before calling AI", async () => {
  job.input.recipient = "ikuti @akun.siswa";
  expect((await handler(request())).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("settle_moderation_intake", expect.objectContaining({ p_decision: "local_reject" }));
});
it("does not discard the queue when configuration is missing", async () => {
  delete env.GROQ_API_KEY;
  expect((await handler(request())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
it("limits work per invocation", async () => {
  override("claim_moderation_intake", [job]);
  const response = await handler(request());
  expect(await response.json()).toEqual({ processed: 3 });
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("does not report a stale queue lease as completed", async () => {
  override("settle_moderation_intake", false);
  expect(await (await handler(request())).json()).toEqual({ processed: 0, deferred: true });
  expect(rpc).toHaveBeenCalledWith("release_moderation_intake", expect.objectContaining({ p_lease_token: job.lease_token }));
});
