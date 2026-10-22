import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import handler, { renderMenfess } from "../api/render-menfess.js";
afterEach(() => vi.unstubAllEnvs());

describe("menfess JPEG renderer", () => {
  it("fails closed when the renderer secret is not configured", async () => {
    vi.stubEnv("RENDERER_SECRET", undefined);
    const res = { status: vi.fn().mockReturnThis(), end: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
    await handler({ method: "POST", headers: { authorization: "Bearer undefined" }, body: { category: "menfess", recipient: null, content: "A synthetic renderer fixture." } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });
  it("creates valid 1080x1350 JPEG with Unicode", async () => {
    const output = await renderMenfess({ category: "apresiasi", recipient: "Teman 👩🏽‍🎓", content: "Terima kasih, sudah membantu hari ini — tetap semangat! 😊" });
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
  });

  it("rejects content that cannot fit", async () => {
    await expect(renderMenfess({ category: "curhat", recipient: null, content: "x".repeat(501) })).rejects.toThrow("INVALID_CONTENT");
  });
});
