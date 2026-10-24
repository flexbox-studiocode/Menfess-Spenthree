// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: mocks.createClient }));
let env, handler, rpc, job;
const secret = "synthetic-worker-secret-".repeat(2);
const request = () => new Request("https://edge.example/worker", { method: "POST", headers: { authorization: `Bearer ${secret}` } });
beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: key => env[key] }, serve: vi.fn() });
  await import("../../supabase/functions/process-moderation-queue/index.ts");
  handler = Deno.serve.mock.calls[0][0];
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.restoreAllMocks();
  env = { MODERATION_WORKER_SECRET: secret, SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    GROQ_API_KEY: "synthetic-key", MODERATION_MODEL: "openai/gpt-oss-120b", MODERATION_POLICY_REVISION: "school-v1",
    MODERATION_REQUESTS_PER_MINUTE: "30", MODERATION_REQUESTS_PER_DAY: "1000", MODERATION_TOKENS_PER_MINUTE: "8000", MODERATION_TOKENS_PER_DAY: "200000" };
  job = { message_id: crypto.randomUUID(), request_id: crypto.randomUUID(), lease_token: crypto.randomUUID(), payload_hash: `v1:${"a".repeat(64)}`,
    input: { category: "aspirasi", recipient: null, content: "Tolong tambah buku di perpustakaan." } };
  let claimed = false;
  rpc = vi.fn(async name => {
    if (name === "claim_message_moderation_jobs") { const jobs = claimed ? [] : [job]; claimed = true; return { data: jobs }; }
    if (name === "claim_moderation_intake") return { data: [] };
    if (name === "reserve_moderation") return { data: { kind: "cached", decision: "allow" } };
    return { data: true };
  });
  mocks.createClient.mockReturnValue({ rpc });
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
it.each(["allow", "reject", "uncertain"])("settles existing message %s without inserting another message", async decision => {
  const original = rpc.getMockImplementation();
  rpc.mockImplementation((name, params) => name === "reserve_moderation" ? { data: { kind: "cached", decision } } : original(name, params));
  expect(await (await handler(request())).json()).toEqual({ processed: 1 });
  expect(rpc).toHaveBeenCalledWith("settle_message_moderation_job", expect.objectContaining({ p_message_id: job.message_id, p_lease_token: job.lease_token, p_decision: decision }));
  expect(rpc.mock.calls.some(([name]) => name === "settle_moderation_intake")).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("defers an existing message when moderation reservation is unavailable", async () => {
  const original = rpc.getMockImplementation();
  rpc.mockImplementation((name, params) => name === "reserve_moderation" ? { data: { kind: "unavailable" } } : original(name, params));
  expect((await handler(request())).status).toBe(202);
  expect(rpc).toHaveBeenCalledWith("release_message_moderation_job", { p_message_id: job.message_id, p_lease_token: job.lease_token, p_retry_after: 60 });
  expect(fetch).not.toHaveBeenCalled();
});
it("settles a local rejection without contacting AI", async () => {
  job.input.recipient = "ikuti @akun.siswa";
  expect((await handler(request())).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("settle_message_moderation_job", expect.objectContaining({ p_decision: "local_reject" }));
  expect(fetch).not.toHaveBeenCalled();
});
