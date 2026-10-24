// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corsForRequest, logFailure } from "../../supabase/functions/_shared/http.ts";
import { encrypt, hex } from "../../supabase/functions/_shared/crypto.ts";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: mocks.createClient }));

const productionOrigins = [
  "https://menfess-spenthree.vercel.app",
  "https://menfess-spenthree-eight.vercel.app",
];
const production = productionOrigins[0];
const configured = "https://school.example";
const trackingCode = `SPT-${"A".repeat(32)}`;
const validSubmission = {
  request_id: "aabbccdd-1234-4567-89ab-123456789abc",
  category: "menfess",
  content: "A valid anonymous message",
  recipient: null,
  rules_accepted: true,
};
let env, submit, track, rpc, maybeSingle, select, eq, from, consoleError;

function request(body, { method = "POST", origin = configured, headers = {} } = {}) {
  return new Request("https://edge.example/test", {
    method,
    headers: { ...(origin === undefined ? {} : { origin }), ...headers },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

function expectCors(response, origin = configured) {
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(response.headers.get("vary")).toBe("Origin");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toBe("authorization, x-client-info, apikey, content-type, x-voter-id");
}

beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: (key) => env[key] }, serve: vi.fn() });
  await import("../../supabase/functions/submit-menfess/index.ts");
  submit = globalThis.Deno.serve.mock.calls[0][0];
  await import("../../supabase/functions/track-menfess/index.ts");
  track = globalThis.Deno.serve.mock.calls[1][0];
});

afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.restoreAllMocks();
  env = Object.fromEntries(["TRACKING_HASH_SECRET", "PAYLOAD_HASH_SECRET", "RECEIPT_ENCRYPTION_SECRET", "SUPABASE_SERVICE_ROLE_KEY"].map((key) => [key, "test-only-not-a-real-secret-".repeat(2)]));
  env.SUPABASE_URL = "https://local-test-placeholder.example";
  env.CORS_ORIGIN = ` ${configured},http://localhost:5173,http://127.0.0.1:5173 `;
  Object.assign(env, { GROQ_API_KEY: "synthetic-key", MODERATION_MODEL: "openai/gpt-oss-120b", MODERATION_POLICY_REVISION: "school-v1", MODERATION_REQUESTS_PER_MINUTE: "30", MODERATION_REQUESTS_PER_DAY: "1000", MODERATION_TOKENS_PER_MINUTE: "8000", MODERATION_TOKENS_PER_DAY: "200000" });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ decision: "allow", reasons: [] }) } }] }))));
  const receipts = new Map();
  rpc = vi.fn(async (name, params) => {
    if (name === "lookup_submit_receipt") {
      const receipt = receipts.get(params.p_request_id);
      return { data: receipt ? { ...receipt, payload_hash: receipt.receipt_payload_hash, kind: receipt.receipt_payload_hash === params.p_payload_hash ? "replay" : "conflict" } : { kind: "missing" }, error: null };
    }
    if (name === "track_moderation_intake") return { data: null, error: null };
    if (name === "reserve_moderation") return { data: { kind: "acquired", lease_token: "test-lease" }, error: null };
    if (name === "reserve_moderation_quota" || name === "finish_moderation") return { data: true, error: null };
    if (name === "release_moderation") return { data: null, error: null };
    const receipt = {
    kind: "accepted",
    payload_hash: params.p_payload_hash,
    receipt_payload_hash: params.p_payload_hash,
    encrypted_response: params.p_encrypted_response,
    encryption_key_version: params.p_encryption_key_version,
    expires_at: "2999-01-01T00:00:00Z",
    };
    receipts.set(params.p_request_id, receipt);
    return { data: [receipt], error: null };
  });
  maybeSingle = vi.fn().mockResolvedValue({ data: { request_id: validSubmission.request_id, status: "queued", web_status: "visible", web_published_at: "2026-01-01T00:00:00Z" }, error: null });
  eq = vi.fn(() => ({ maybeSingle }));
  select = vi.fn(() => ({ eq }));
  from = vi.fn(table => table === "messages" ? { select }
    : { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: table === "moderation_decisions" ? { state: "evaluating" } : table === "moderation_control" ? { active_policy: "current-policy" } : { state: "pending" }, error: null }) })) })) });
  mocks.createClient.mockReset().mockReturnValue({ rpc, from });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("edge CORS policy", () => {
  it.each([...productionOrigins, configured, "http://localhost:5173", "http://127.0.0.1:5173"])("allows exact approved origin %s", (origin) => {
    expectCors(new Response(null, { headers: corsForRequest(request(null, { origin })) }), origin);
  });
  it("always allows production without configuration", () => {
    delete env.CORS_ORIGIN;
    expect(corsForRequest(request(null, { origin: production }))["access-control-allow-origin"]).toBe(production);
  });
  it.each(["*", "null", "https://school.example.evil.test", "https://evil-school.example", "https://school.example/", "http://school.example", "http://localhost:3000"])("rejects unapproved origin %s", (origin) => {
    expectCors(new Response(null, { headers: corsForRequest(request(null, { origin })) }), null);
  });
  it.each(["*", "null", "https://school.example/path", "https://school.example/", "http://school.example", "https://*.example"])("does not trust invalid configuration %s", (origin) => {
    env.CORS_ORIGIN = origin;
    expect(corsForRequest(request(null, { origin }))["access-control-allow-origin"]).toBeUndefined();
  });
  it("rejects absent origins and localhost unless configured", () => {
    delete env.CORS_ORIGIN;
    expect(corsForRequest(new Request("https://edge.example"))["access-control-allow-origin"]).toBeUndefined();
    expect(corsForRequest(request(null, { origin: "http://localhost:5173" }))["access-control-allow-origin"]).toBeUndefined();
  });
});

describe.each(["submit", "track"])("%s handler common responses", (name) => {
  const handler = (req) => (name === "submit" ? submit : track)(req);
  it("returns bodyless OPTIONS 204 with CORS without DB access", async () => {
    const response = await handler(request(null, { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expectCors(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("keeps rejected preflights free of allow-origin", async () => {
    const response = await handler(request(null, { method: "OPTIONS", origin: "https://evil.example" }));
    expect(response.status).toBe(204);
    expectCors(response, null);
  });
  it("returns validation errors with CORS", async () => {
    const response = await handler(request({}));
    expect(response.status).toBe(400);
    expectCors(response);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("rejects unsupported methods with CORS", async () => {
    const response = await handler(request(null, { method: "GET" }));
    expect(response.status).toBe(400);
    expectCors(response);
  });
  it("returns safe internal errors when configuration is missing", async () => {
    delete env.TRACKING_HASH_SECRET;
    const response = await handler(request(name === "submit" ? validSubmission : { tracking_code: trackingCode }));
    expect(response.status).toBe(500);
    expectCors(response);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toEqual({ request_id: body.error.request_id, stage: "validate_secrets", error_name: "Error" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("submit receipts", () => {
  it("never claims legacy pending receipts are visible without a current message", async () => {
    const encrypted = await encrypt(env.RECEIPT_ENCRYPTION_SECRET, JSON.stringify({ tracking_code: trackingCode, status: "pending_moderation" }), `${validSubmission.request_id}:v1`);
    rpc.mockImplementation(async (name, params) => ({ data: name === "track_moderation_intake" ? null : { kind: "replay", payload_hash: params.p_payload_hash, encrypted_response: `\\x${hex(encrypted)}`, encryption_key_version: "v1", expires_at: "2999-01-01T00:00:00Z" }, error: null }));
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending_moderation", web_status: "hidden", moderation_status: "pending", delivery_status: null });
    expect(from).not.toHaveBeenCalledWith("moderation_decisions");
    const original = rpc.getMockImplementation();
    rpc.mockImplementation((name, params) => name === "track_moderation_intake" ? { data: { status: "blocked" }, error: null } : original(name, params));
    expect(await (await submit(request(validSubmission))).json()).toMatchObject({ status: "blocked", web_status: "hidden", moderation_status: "blocked", delivery_status: null });
  });
  it("reports the current persisted status when a receipt is replayed after delivery", async () => {
    await submit(request(validSubmission));
    maybeSingle.mockResolvedValue({ data: { status: "published", web_status: "hidden" }, error: null });
    const response = await submit(request(validSubmission));
    expect(await response.json()).toMatchObject({ status: "published", delivery_status: "published", web_status: "hidden" });
  });
  it("publishes directly without AI even when the provider is down and its key is missing", async () => {
    delete env.GROQ_API_KEY;
    fetch.mockRejectedValue(new Error("provider unavailable"));
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("queued");
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["lookup_submit_receipt", "submit_menfess_direct_atomic"]);
  });
  it("publishes directly with local deterministic validation", async () => {
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(200);
    expectCors(response);
    expect(await response.json()).toMatchObject({ accepted: true, status: "queued", tracking_code: expect.stringMatching(/^SPT-[A-F0-9]{32}$/) });
    expect(rpc).toHaveBeenCalledWith("submit_menfess_direct_atomic", expect.objectContaining({ p_request_id: validSubmission.request_id, p_category: validSubmission.category, p_recipient: null, p_content: validSubmission.content, p_tracking_code_hash: expect.stringMatching(/^v1:[a-f0-9]{64}$/) }));
    expect(consoleError).not.toHaveBeenCalled();
  });
  it("returns the same receipt when an identical request is retried", async () => {
    const first = await (await submit(request(validSubmission))).json();
    fetch.mockRejectedValue(new Error("provider down during replay"));
    const retry = await submit(request(validSubmission));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(first);
  });
  it("returns 409 for an existing request ID with a different payload", async () => {
    await submit(request(validSubmission));
    const response = await submit(request({ ...validSubmission, content: "A different valid message" }));
    expect(response.status).toBe(409);
    expectCors(response);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
  it("returns 409 for expired receipts", async () => {
    const implementation = rpc.getMockImplementation();
    rpc.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[0] === "submit_menfess_direct_atomic") result.data[0].expires_at = "2000-01-01T00:00:00Z";
      return result;
    });
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(409);
    expectCors(response);
    expect((await response.json()).error.code).toBe("RECEIPT_EXPIRED");
  });
  it.each([
    { recipient: "Hubungi user@example.com" },
    { recipient: "ikuti @nama.akun" },
  ])("rejects unsafe recipient without writing messages: %j", async (changes) => {
    const response = await submit(request({ ...validSubmission, ...changes }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({ code: "CONTENT_UNSAFE", fields: { recipient: expect.any(String) } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("lookup_submit_receipt");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized requests before parsing", async () => {
    const response = await submit(request(validSubmission, { headers: { "content-length": "12001" } }));
    expect(response.status).toBe(413);
    expectCors(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("enforces actual UTF-8 body bytes when content-length is absent or false", async () => {
    const response = await submit(request({ ...validSubmission, content: "😀".repeat(4000) }));
    expect(response.status).toBe(413);
    expectCors(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("tracking lookup", () => {
  it.each([
    { state: "blocked", decision: null, expected: "blocked" },
    { state: "approved", decision: { state: "allow", policy_version: "old-policy", content_hash: "content-hash" }, expected: "pending" },
    { state: "approved", decision: { state: "allow", policy_version: "current-policy", content_hash: "stale-content" }, expected: "pending" },
    { state: "pending", decision: { state: "allow", policy_version: "current-policy", content_hash: "content-hash", payload_hash: "wrong-payload" }, expected: "pending" },
    { state: "pending", decision: { state: "allow", policy_version: "current-policy", content_hash: "content-hash", payload_hash: "payload-hash" }, expected: "pending" },
    { state: "approved", decision: { state: "allow", policy_version: "current-policy", content_hash: "content-hash", payload_hash: "payload-hash" }, expected: "approved" },
  ])("reports truthful job/decision status $expected", async ({ state, decision, expected }) => {
    maybeSingle.mockResolvedValue({ data: { id: "message-id", status: "queued", web_status: state === "blocked" ? "hidden" : "visible", safety_content_hash: "content-hash" }, error: null });
    const originalFrom = from.getMockImplementation();
    from.mockImplementation(table => table === "messages" ? originalFrom(table) : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "moderation_decisions" ? decision : table === "moderation_control" ? { active_policy: "current-policy" } : { state, payload_hash: "payload-hash" }, error: null }) }) }) });
    expect(await (await track(request({ tracking_code: trackingCode }))).json()).toMatchObject({ moderation_status: expected, delivery_status: "queued" });
    // Receipt replay uses the same persisted moderation truth, not receipt status.
    expect(await (await submit(request(validSubmission))).json()).toMatchObject({ moderation_status: expected, delivery_status: "queued" });
  });
  it.each(["allow", "reject", "uncertain", "evaluating"])("uses authoritative decision %s and withholds hidden public IDs and private data", async state => {
    maybeSingle.mockResolvedValue({ data: { request_id: validSubmission.request_id, status: "queued", public_id: "hidden-id", web_status: "hidden", safety_content_hash: "content-hash", content: "private", tracking_code_hash: "private-hash" }, error: null });
    const messageFrom = from.getMockImplementation();
    from.mockImplementation(table => table === "moderation_decisions"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state, policy_version: "current-policy", content_hash: "content-hash", reasons: ["private-reason"] }, error: null }) }) }) }
      : table === "message_moderation_jobs" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      : messageFrom(table));
    const response = await track(request({ tracking_code: trackingCode }));
    const body = await response.json();
    expect(body).toMatchObject({ web_status: "hidden", delivery_status: "queued", moderation_status: state === "allow" ? "approved" : state === "evaluating" ? "pending" : "blocked" });
    expect(body).not.toHaveProperty("public_id");
    expect(JSON.stringify(body)).not.toMatch(/private|hidden-id|request_id/);
  });
  it.each(["queued", "published"])("returns %s with CORS and only public status fields", async (status) => {
    maybeSingle.mockResolvedValue({ data: { request_id: validSubmission.request_id, public_id: "public-test", status, web_status: "visible", web_published_at: "2026-01-01T00:00:00Z", published_at: "2026-01-01T00:00:00Z", ig_permalink: "https://instagram.com/p/test", content: "private" }, error: null });
    const response = await track(request({ tracking_code: trackingCode }));
    expect(response.status).toBe(200);
    expectCors(response);
    expect(await response.json()).toEqual({ status, delivery_status: status, web_status: "visible", moderation_status: "pending", public_id: "public-test", web_published_at: "2026-01-01T00:00:00Z", message: expect.any(String), published_at: status === "published" ? "2026-01-01T00:00:00Z" : null, ig_permalink: status === "published" ? "https://instagram.com/p/test" : null });
    expect(from).toHaveBeenCalledWith("messages");
    expect(select).toHaveBeenCalledWith("id,request_id,public_id,status,web_status,web_published_at,published_at,ig_permalink,safety_content_hash");
    expect(eq).toHaveBeenCalledWith("tracking_code_hash", expect.stringMatching(/^v1:[a-f0-9]{64}$/));
  });
  it.each(["pending_moderation", "blocked"])("tracks private intake %s without returning content", async status => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const original = rpc.getMockImplementation();
    rpc.mockImplementation((name, params) => name === "track_moderation_intake" ? { data: { status, content: "private" } } : original(name, params));
    const response = await track(request({ tracking_code: trackingCode }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status, web_status: "hidden", moderation_status: status === "blocked" ? "blocked" : "pending", delivery_status: null, message: expect.any(String), published_at: null, ig_permalink: null });
  });
  it("returns 404 only when the lookup succeeds without a row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await track(request({ tracking_code: trackingCode }));
    expect(response.status).toBe(404);
    expectCors(response);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe.each(["submit", "track"])("%s safe DB failures", (name) => {
  it("returns 500 rather than 404 and never logs private upstream details", async () => {
    const privateText = "private message, service-role credential, tracking receipt";
    const dbError = { name: "DatabaseError", code: "XX000", message: privateText, details: privateText, hint: privateText };
    rpc.mockResolvedValue({ data: null, error: dbError });
    maybeSingle.mockResolvedValue({ data: null, error: dbError });
    const response = await (name === "submit" ? submit(request(validSubmission)) : track(request({ tracking_code: trackingCode })));
    expect(response.status).toBe(name === "submit" ? 503 : 500);
    expectCors(response);
    const body = await response.json();
    expect(body.error.code).toBe(name === "submit" ? "MODERATION_UNAVAILABLE" : "INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain(privateText);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toEqual(name === "submit" ? { request_id: body.error.request_id, stage: "direct_replay", error_name: "ModerationUnavailable" } : { request_id: body.error.request_id, stage: "lookup_tracking", error_name: "DatabaseError", error_code: "XX000" });
  });
});

it("logFailure omits unsafe or oversized error tokens and arbitrary details", () => {
  logFailure("test-request", "test-stage", { name: "Secret: tracking-code", code: "X".repeat(49), message: "private" });
  expect(JSON.parse(consoleError.mock.calls[0][0])).toEqual({ request_id: "test-request", stage: "test-stage" });
});


describe("field validation", () => {
  it.each([
    { category: "unknown" },
    { content: "short" },
    { content: "x".repeat(501) },
    { recipient: "x".repeat(81) },
    { rules_accepted: false },
    { request_id: "not-a-uuid" },
    { request_id: [validSubmission.request_id] },
    { recipient: 123 },
    { unexpected: "field" },
  ])("rejects invalid submit fields %j without DB access", async (changes) => {
    const response = await submit(request({ ...validSubmission, ...changes }));
    expect(response.status).toBe(400);
    expectCors(response);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([null, {}, { tracking_code: trackingCode.toLowerCase() }, { tracking_code: "SPT-short" }, { tracking_code: trackingCode, extra: true }])("rejects invalid tracking input %j", async (body) => {
    const response = await track(request(body));
    expect(response.status).toBe(400);
    expectCors(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
