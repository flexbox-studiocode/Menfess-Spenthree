import { describe, expect, it } from "vitest";
import { mergeFirstPage } from "./feedMerge.js";

const row = (number, extra = {}) => ({ public_id: `id-${number}`, created_at: `2026-10-${String(number).padStart(2, "0")}T00:00:00Z`, status: "queued", ...extra });

describe("authoritative first-page refresh", () => {
  it("uses fresh rows rather than overwriting them with stale delivery and likes", () => {
    const fresh = row(5, { status: "published", like_count: 3 });
    expect(mergeFirstPage([row(5, { like_count: 0 })], [fresh], null).items).toEqual([fresh]);
  });
  it("removes hidden rows in the refreshed range without losing older loaded pages", () => {
    const result = mergeFirstPage([row(6), row(5), row(4), row(3), row(2)], [row(6), row(4)], "next");
    expect(result.items.map(item => item.public_id)).toEqual(["id-6", "id-4", "id-3", "id-2"]);
  });
  it("removes missing rows even while holding new rows for a scrolled reader", () => {
    const fresh = row(4, { status: "published" });
    const result = mergeFirstPage([row(5), row(4), row(2)], [row(6), fresh], "next", true);
    expect(result.items).toEqual([fresh, row(2)]);
    expect(result.pending).toEqual([row(6)]);
  });
  it("removes every missing row when the refreshed result is exhaustive", () => {
    expect(mergeFirstPage([row(5), row(2)], [row(5)], null).items).toEqual([row(5)]);
    expect(mergeFirstPage([row(5)], [], null, true)).toEqual({ items: [], pending: [] });
  });
  it("replaces the pending set when a new row disappears before it is displayed", () => {
    expect(mergeFirstPage([row(4)], [row(4)], "next", true).pending).toEqual([]);
  });
});
