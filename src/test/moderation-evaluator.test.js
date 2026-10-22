import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it.each([{ calls: "0", tpm: "8000" }, { calls: "1", tpm: "1" }])("does not pass or call the provider with insufficient budget %j", ({ calls, tpm }) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "menfess-evaluation-"));
  try {
    let exit;
    try {
      execFileSync(process.execPath, [path.resolve("scripts/evaluate-moderation.mjs")], {
        cwd: directory, timeout: 2000, stdio: "pipe", env: { ...process.env,
          GROQ_API_KEY: "synthetic-not-a-real-key", MODERATION_MODEL: "openai/gpt-oss-120b", MODERATION_POLICY_REVISION: "school-v1",
          MODERATION_REQUESTS_PER_MINUTE: "30", MODERATION_REQUESTS_PER_DAY: "1000", MODERATION_TOKENS_PER_MINUTE: tpm, MODERATION_TOKENS_PER_DAY: "200000", MODERATION_EVALUATION_MAX_CALLS: calls,
        },
      });
    } catch (error) { exit = error.status; }
    expect(exit).toBe(1);
    const report = JSON.parse(readFileSync(path.join(directory, "artifacts/moderation-evaluation.json"), "utf8"));
    expect(report.results).toEqual([]);
    expect(report.budget.requests).toBe(0);
    expect(report.summary.every(round => !round.passed)).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
