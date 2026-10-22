// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corsForRequest, logFailure } from "../../supabase/functions/_shared/http.ts";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: mocks.createClient }));

const production = "https://menfess-spenthree-eight.vercel.app";
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
  expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toBe("authorization, x-client-info, apikey, content-type");
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
  rpc = vi.fn(async (_name, params) => ({ data: [{
    receipt_payload_hash: params.p_payload_hash,
    encrypted_response: params.p_encrypted_response,
    encryption_key_version: params.p_encryption_key_version,
    expires_at: "2999-01-01T00:00:00Z",
  }], error: null }));
  maybeSingle = vi.fn().mockResolvedValue({ data: { status: "queued" }, error: null });
  eq = vi.fn(() => ({ maybeSingle }));
  select = vi.fn(() => ({ eq }));
  from = vi.fn(() => ({ select }));
  mocks.createClient.mockReset().mockReturnValue({ rpc, from });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("edge CORS policy", () => {
  it.each([production, configured, "http://localhost:5173", "http://127.0.0.1:5173"])("allows exact approved origin %s", (origin) => {
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
  it("returns 202 with CORS and round-trips the encrypted RPC receipt", async () => {
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(202);
    expectCors(response);
    expect(await response.json()).toMatchObject({ accepted: true, status: "queued", tracking_code: expect.stringMatching(/^SPT-[A-F0-9]{32}$/) });
    expect(rpc).toHaveBeenCalledWith("submit_menfess_atomic", expect.objectContaining({ p_request_id: validSubmission.request_id, p_content: validSubmission.content, p_tracking_code_hash: expect.stringMatching(/^v1:[a-f0-9]{64}$/) }));
    expect(consoleError).not.toHaveBeenCalled();
  });
  it("returns the same receipt when an identical request is retried", async () => {
    const implementation = rpc.getMockImplementation();
    let stored;
    rpc.mockImplementation(async (...args) => stored ??= await implementation(...args));
    const first = await (await submit(request(validSubmission))).json();
    const retry = await submit(request(validSubmission));
    expect(retry.status).toBe(202);
    expect(await retry.json()).toEqual(first);
  });
  it("returns 409 for an existing request ID with a different payload", async () => {
    const implementation = rpc.getMockImplementation();
    let stored;
    rpc.mockImplementation(async (...args) => stored ??= await implementation(...args));
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
      result.data[0].expires_at = "2000-01-01T00:00:00Z";
      return result;
    });
    const response = await submit(request(validSubmission));
    expect(response.status).toBe(409);
    expectCors(response);
    expect((await response.json()).error.code).toBe("RECEIPT_EXPIRED");
  });
  it("rejects oversized requests before parsing", async () => {
    const response = await submit(request(validSubmission, { headers: { "content-length": "12001" } }));
    expect(response.status).toBe(413);
    expectCors(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("tracking lookup", () => {
  it.each(["queued", "published"])("returns %s with CORS and only public status fields", async (status) => {
    maybeSingle.mockResolvedValue({ data: { status, published_at: "2026-01-01T00:00:00Z", ig_permalink: "https://instagram.com/p/test", content: "private" }, error: null });
    const response = await track(request({ tracking_code: trackingCode }));
    expect(response.status).toBe(200);
    expectCors(response);
    expect(await response.json()).toEqual({ status, message: expect.any(String), published_at: status === "published" ? "2026-01-01T00:00:00Z" : null, ig_permalink: status === "published" ? "https://instagram.com/p/test" : null });
    expect(from).toHaveBeenCalledWith("messages");
    expect(select).toHaveBeenCalledWith("status,published_at,ig_permalink");
    expect(eq).toHaveBeenCalledWith("tracking_code_hash", expect.stringMatching(/^v1:[a-f0-9]{64}$/));
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
    expect(response.status).toBe(500);
    expectCors(response);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain(privateText);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toEqual({ request_id: body.error.request_id, stage: name === "submit" ? "rpc_submit" : "lookup_tracking", error_name: "DatabaseError", error_code: "XX000" });
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
