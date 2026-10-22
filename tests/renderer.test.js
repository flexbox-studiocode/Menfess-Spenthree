import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderMenfess } from "../api/render-menfess.js";

describe("menfess JPEG renderer", () => {
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
