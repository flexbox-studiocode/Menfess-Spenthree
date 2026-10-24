import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { contentFingerprint, readSafetyConfig, safetyPolicyVersion } from "../../supabase/functions/_shared/content-safety.ts";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createContainer: vi.fn(), containerStatus: vi.fn(), parseContainerStatus: vi.fn(body => String(body?.status_code ?? body?.status ?? "UNKNOWN").toUpperCase()), publishContainer: vi.fn(), mediaPermalink: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: mocks.createClient }));
vi.mock("../../supabase/functions/_shared/instagram.ts", () => ({ ...mocks, readInstagramConfig: get => ({ token: get("INSTAGRAM_ACCESS_TOKEN"), userId: get("INSTAGRAM_USER_ID"), version: get("INSTAGRAM_API_VERSION"), authMode: get("INSTAGRAM_AUTH_MODE") }) }));
let handler, env, control, message, approval, rpc, upload, queries, publishingError;
const request = () => new Request("https://worker.invalid", { method: "POST", headers: { authorization: "Bearer worker-fixture" } });
beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: key => env[key] }, serve: vi.fn() });
  await import("../../supabase/functions/process-publication-queue/index.ts");
  handler = Deno.serve.mock.calls[0][0];
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  env = { WORKER_CRON_SECRET: "worker-fixture", INSTAGRAM_PUBLISH_ENABLED: "true", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "service-fixture", INSTAGRAM_ACCESS_TOKEN: "ig-fixture", INSTAGRAM_USER_ID: "123", INSTAGRAM_API_VERSION: "v25.0", RENDERER_URL: "https://renderer.invalid", RENDERER_SECRET: "renderer-fixture", MODERATION_POLICY_REVISION: "school-v1" };
  const safety = readSafetyConfig(() => undefined);
  const policyVersion = await safetyPolicyVersion(safety, { ...safety, minCodePoints: 1, maxCodePoints: 80 }, "school-v1");
  control = { active_policy: policyVersion, publishing_enabled: true };
  message = { id: "message-1", request_id: "request-1", category: "aspirasi", recipient: null, content: "Tolong tambah tempat sampah di taman.", status: "queued", safety_approved_at: new Date().toISOString(), safety_policy_version: policyVersion, safety_content_hash: await contentFingerprint({ category: "aspirasi", recipient: null, content: "Tolong tambah tempat sampah di taman." }) };
  approval = { state: "allow", policy_version: policyVersion, content_hash: message.safety_content_hash };
  publishingError = false; queries = [];
  let claimed = false;
  rpc = vi.fn().mockImplementation(async name => {
    if (name === "claim_publication_jobs") {
      const jobs = claimed ? [] : [{ job_id: "job-1", message_id: "message-1", lock_token: "lease-1" }];
      claimed = true;
      return { data: jobs, error: null };
    }
    return { data: name === "finish_publication_job" ? "retry_scheduled" : true, error: null };
  });
  upload = vi.fn().mockResolvedValue({ error: null });
  const from = table => {
    let update;
    const query = { select: () => query, eq: () => query, in: () => query, update: value => { update = value; queries.push({ table, update }); return query; }, single: () => query,
      then(resolve) {
        if (update) return Promise.resolve({ data: [{ id: "row-1" }], error: publishingError && update.status === "publishing" ? { code: "23514" } : null }).then(resolve);
        return Promise.resolve({ data: table === "moderation_control" ? control : table === "moderation_decisions" ? approval : table === "publication_jobs" ? { status: "processing", lock_token: "lease-1", lease_expires_at: "2999-01-01T00:00:00Z", last_stage: "claim", publication_attempt_token: "lease-1", ambiguous_at: rpc.mock.calls.some(([name]) => name === "prepare_ai_publication") ? "2026-01-01T00:00:00Z" : null } : message, error: null }).then(resolve);
      } };
    return query;
  };
  mocks.createClient.mockReturnValue({ rpc, from, storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://media.invalid/synthetic.jpg" } }) }) } });
  mocks.createContainer.mockResolvedValue({ id: "987654" }); mocks.containerStatus.mockResolvedValue({ status_code: "FINISHED" }); mocks.publishContainer.mockResolvedValue({ id: "123456" }); mocks.mediaPermalink.mockResolvedValue({ permalink: "https://www.instagram.com/p/synthetic/" });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Uint8Array([255,216,255]))));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
it("does not claim or render while the database publication gate is closed", async () => {
  control.publishing_enabled = false;
  expect((await handler(request())).status).toBe(202);
  expect(rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.publishContainer).not.toHaveBeenCalled();
});
it.each(["reject", "stale", "changed"])("does not render/upload/publish without matching current AI approval: %s", async condition => {
  if (condition === "reject") approval.state = "reject";
  if (condition === "stale") approval.policy_version = "old-policy";
  if (condition === "changed") message.content = "A changed payload that has no valid approval.";
  await handler(request());
  expect(fetch).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(mocks.createContainer).not.toHaveBeenCalled();
});
it("stops before Meta calls if the database refuses the publishing transition", async () => {
  publishingError = true; await handler(request());
  expect(mocks.createContainer).not.toHaveBeenCalled(); expect(mocks.publishContainer).not.toHaveBeenCalled();
});
it("preserves publication with local admission plus separate current AI approval", async () => {
  message.safety_policy_version = `v1:${"1".repeat(64)}`;
  const result = await (await handler(request())).json();
  expect(result.processed).toBe(1);
  expect(mocks.publishContainer).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("claim_publication_jobs", { p_limit: 1, p_lease_seconds: 240 });
});
it("does not publish when AI approval is revoked while the Meta container becomes ready", async () => {
  mocks.containerStatus.mockImplementationOnce(async () => { approval.state = "reject"; return { status_code: "FINISHED" }; });
  await handler(request());
  expect(mocks.createContainer).toHaveBeenCalledTimes(1);
  expect(mocks.publishContainer).not.toHaveBeenCalled();
});
it("does not call Meta publish if the atomic final approval/lease gate refuses", async () => {
  const original = rpc.getMockImplementation();
  rpc.mockImplementation((name, params) => name === "prepare_ai_publication" ? Promise.resolve({ data: false }) : original(name, params));
  await handler(request());
  expect(mocks.publishContainer).not.toHaveBeenCalled();
});
it("quarantines a timeout after publish instead of scheduling a blind retry", async () => {
  mocks.publishContainer.mockRejectedValueOnce(new Error("IG_TEMPORARY"));
  await handler(request());
  expect(rpc).toHaveBeenCalledWith("finish_publication_job", expect.objectContaining({ p_error_code: "PUBLISH_AMBIGUOUS", p_retryable: false }));
});
it("reports a failure when the failure transition cannot be persisted", async () => {
  approval.state = "reject";
  const original = rpc.getMockImplementation();
  rpc.mockImplementation((name, params) => name === "finish_publication_job" ? { data: null, error: { code: "db-failed" } } : original(name, params));
  expect((await handler(request())).status).toBe(500);
});
it("quarantines a container already published rather than publishing twice", async () => {
  mocks.containerStatus.mockResolvedValueOnce({ status_code: "PUBLISHED" });
  await handler(request());
  expect(mocks.publishContainer).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("finish_publication_job", expect.objectContaining({ p_error_code: "PUBLISH_AMBIGUOUS", p_retryable: false }));
});
it("rejects malformed container IDs before publishing", async () => {
  mocks.createContainer.mockResolvedValueOnce({});
  await handler(request());
  expect(mocks.publishContainer).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("finish_publication_job", expect.objectContaining({ p_error_code: "IG_TEMPORARY" }));
});
it("clears an expired unpublished container before retry", async () => {
  mocks.containerStatus.mockResolvedValueOnce({ status_code: "EXPIRED" });
  await handler(request());
  expect(queries).toContainEqual({ table: "publication_jobs", update: { container_id: null, last_stage: "container_unavailable" } });
  expect(mocks.publishContainer).not.toHaveBeenCalled();
});
