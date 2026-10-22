import { describe, expect, it } from "vitest";
import { evaluateContentSafety, readSafetyConfig, safetyPolicyVersion } from "../../supabase/functions/_shared/content-safety.ts";

describe("deterministic content safety", () => {
  const config = readSafetyConfig((key) => key === "CONTENT_SAFETY_FORBIDDEN_TERMS" ? "rahasia, spam" : undefined);
  it.each([
    "Hubungi user@example.com sekarang",
    "Nomor saya +62 812-3456-7890",
    "Lihat https://example.com/path",
    "ikuti @nama.akun sekarang",
    "Pesan ini berisi SPAM terlarang",
  ])("rejects contact/forbidden content: %s", async (content) => {
    expect(await evaluateContentSafety(content, config)).toMatchObject({ approved: false, code: "CONTENT_UNSAFE" });
  });
  it("approves ordinary content with stable policy version", async () => {
    const content = "Terima kasih sudah membantu hari ini.";
    const first = await evaluateContentSafety(content, config);
    expect(first).toMatchObject({ approved: true, policyVersion: expect.stringMatching(/^v1:[a-f0-9]{64}$/) });
    expect(await evaluateContentSafety(content, config)).toEqual(first);
  });
  it("fails closed for an explicitly empty policy and has safe built-in defaults", () => {
    expect(() => readSafetyConfig(() => "")).toThrow("Invalid content safety configuration");
    expect(readSafetyConfig(() => undefined).forbiddenTerms.length).toBeGreaterThan(0);
  });
  it("hashes content and recipient semantics", async () => {
    const recipient = { ...config, minCodePoints: 1, maxCodePoints: 80 };
    await expect(safetyPolicyVersion(config, recipient)).resolves.not.toBe(await safetyPolicyVersion(config, config));
  });
  it.each(["Kamu a.n.j.i.n.g sekali", "Kamu 4nj1ng banget", "Kamu anjiiiing sekali", "Kamu an\u200bjing sekali"])("detects disguised direct profanity: %s", async content => {
    expect(await evaluateContentSafety(content, config)).toMatchObject({ approved: false });
  });
  it.each(["Kucing dan anjing itu dirawat dengan baik.", "Aku sedih dan ingin cerita soal bunuh diri untuk tugas pencegahan.", "Bangku kelas ini perlu diperbaiki."])("defers ambiguous context to AI: %s", async content => {
    expect(await evaluateContentSafety(content, readSafetyConfig(() => undefined))).toMatchObject({ approved: true });
  });
});
