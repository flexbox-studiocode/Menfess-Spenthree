import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ marker: "client" })),
}));

const jwt = (role) =>
  `${btoa("{}").replace(/=/g, "")}.${btoa(JSON.stringify({ role })).replace(/=/g, "")}.signature`;
const config = (key) => ({
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("public Supabase configuration", () => {
  it("accepts publishable keys and legacy anon JWTs", async () => {
    const { readSupabaseConfig } = await import("./supabase.js");
    expect(readSupabaseConfig(config("sb_publishable_test")).key).toBe(
      "sb_publishable_test",
    );
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: jwt("anon"),
      }).key,
    ).toBe(jwt("anon"));
  });
  it.each([
    "sb_secret_test",
    jwt("service_role"),
    jwt("authenticated"),
    "not-a-key",
    "sb_publishable_",
  ])("rejects unsafe or malformed key %s", async (key) => {
    const { readSupabaseConfig } = await import("./supabase.js");
    expect(() => readSupabaseConfig(config(key))).toThrow(
      "Hanya publishable key",
    );
  });
  it("fails safely for missing, ambiguous, or insecure configuration", async () => {
    const { readSupabaseConfig } = await import("./supabase.js");
    expect(() => readSupabaseConfig({})).toThrow("belum lengkap");
    expect(() =>
      readSupabaseConfig({
        ...config("sb_publishable_test"),
        VITE_SUPABASE_ANON_KEY: jwt("anon"),
      }),
    ).toThrow("satu kunci");
    expect(() =>
      readSupabaseConfig({
        ...config("sb_publishable_test"),
        VITE_SUPABASE_URL: "http://example.com",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      readSupabaseConfig({
        ...config("sb_publishable_test"),
        VITE_SUPABASE_URL: "garbage",
      }),
    ).toThrow("tidak valid");
  });
  it("creates a lazy singleton with auth session behavior disabled", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseClient } = await import("./supabase.js");
    expect(createClient).not.toHaveBeenCalled();
    expect(getSupabaseClient()).toBe(getSupabaseClient());
    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
