import { expect, it } from "vitest";
import evaluation from "./fixtures/moderation-evaluation.json";
import tuning from "./fixtures/moderation-tuning.json";
it("keeps the frozen release set distinct from prompt tuning with sufficient critical coverage", () => {
  expect(tuning).toHaveLength(100); expect(evaluation).toHaveLength(200);
  expect(evaluation.filter(row => row.expected === "allow")).toHaveLength(100);
  expect(evaluation.filter(row => row.expected === "reject")).toHaveLength(100);
  expect(evaluation.filter(row => row.critical)).toHaveLength(50);
  expect(evaluation.some(row => row.input.recipient && row.expected === "allow")).toBe(true);
  expect(evaluation.some(row => row.input.recipient?.includes("goblok") && row.expected === "reject")).toBe(true);
  const rows = [...evaluation, ...tuning];
  expect(new Set(rows.map(row => row.id)).size).toBe(300);
  expect(new Set(rows.map(row => JSON.stringify(row.input))).size).toBe(300);
  for (const row of rows) expect([...row.input.content.normalize("NFC")].length).toBeGreaterThanOrEqual(10);
  for (const row of rows) expect([...row.input.content.normalize("NFC")].length).toBeLessThanOrEqual(500);
});
