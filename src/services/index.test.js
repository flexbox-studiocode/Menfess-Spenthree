import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { loaded, invoke } = vi.hoisted(() => ({ loaded: vi.fn(), invoke: vi.fn() }));
vi.mock("../lib/supabase.js", () => {
  loaded();
  return { getSupabaseClient: () => ({ functions: { invoke } }) };
});
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("defers the backend during draft editing and preserves submit/tracking requests", async () => {
  const { saveDraft, readDraft, clearDraft, submitMenfess, trackMenfess, fetchPublicFeed } = await import("./index.js");
  const draft = { content: "Pesan yang belum dikirim", rules_accepted: true };
  saveDraft(draft);
  expect(readDraft()).toEqual(draft);
  clearDraft();
  expect(readDraft()).toBeNull();
  expect(loaded).not.toHaveBeenCalled();
  vi.stubEnv("VITE_SUPABASE_URL", "https://feed-fixture.invalid");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], next_cursor: null }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchPublicFeed({ category: "aspirasi" })).toEqual({ data: [], next_cursor: null });
  expect(fetchMock.mock.calls[0][0].searchParams.get("category")).toBe("aspirasi");
  expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  expect(loaded).not.toHaveBeenCalled();
  invoke.mockResolvedValue({ data: { status: "queued" }, error: null });
  const payload = { content: "Pesan dengan ID tetap", request_id: "retained-id", rules_accepted: true };
  expect(await submitMenfess(payload)).toEqual({ status: "queued" });
  expect(await trackMenfess("SPT-test")).toEqual({ status: "queued" });
  expect(loaded).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenNthCalledWith(1, "submit-menfess", { body: payload, signal: expect.any(AbortSignal) });
  expect(invoke).toHaveBeenNthCalledWith(2, "track-menfess", { body: { tracking_code: "SPT-test" }, signal: expect.any(AbortSignal) });
});
