import { MODEL, MODEL_OPTIONS, POLICY, REASONS, VERDICT_SCHEMA } from "./moderation-policy.ts";
import type { ModelVerdict, ModerationInput } from "./moderation-policy.ts";

export type ModerationConfig = { apiKey: string; model: string; policyRevision: string; requestsPerMinute: number; requestsPerDay: number; tokensPerMinute: number; tokensPerDay: number };
export class ModerationUnavailable extends Error {
  retryAfter: number;
  constructor(retryAfter = 15) { super("MODERATION_UNAVAILABLE"); this.name = "ModerationUnavailable"; this.retryAfter = retryAfter; }
}
export function readModerationConfig(getEnv: (key: string) => string | undefined): ModerationConfig {
  const apiKey = getEnv("GROQ_API_KEY")?.trim();
  const model = getEnv("MODERATION_MODEL");
  const policyRevision = getEnv("MODERATION_POLICY_REVISION");
  const limits = ["REQUESTS_PER_MINUTE", "REQUESTS_PER_DAY", "TOKENS_PER_MINUTE", "TOKENS_PER_DAY"].map(key => {
    const value = getEnv(`MODERATION_${key}`) ?? "";
    if (!/^[1-9]\d{0,8}$/.test(value)) throw new ModerationUnavailable();
    return Number(value);
  });
  if (!apiKey || model !== MODEL || !policyRevision || !/^[a-zA-Z0-9_-]{1,64}$/.test(policyRevision)) throw new ModerationUnavailable();
  return { apiKey, model, policyRevision, requestsPerMinute: limits[0], requestsPerDay: limits[1], tokensPerMinute: limits[2], tokensPerDay: limits[3] };
}
export function reservedModerationTokens(input: ModerationInput): number {
  // UTF-8 bytes conservatively bound input tokens; reserve framing and all reasoning/output.
  return new TextEncoder().encode(POLICY + JSON.stringify(input) + JSON.stringify(VERDICT_SCHEMA)).byteLength + 256 + MODEL_OPTIONS.max_completion_tokens;
}
export async function classifyMessage(input: ModerationInput, config: Pick<ModerationConfig, "apiKey" | "model">, signal: AbortSignal): Promise<ModelVerdict> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 5000);
  try {
    if (config.model !== MODEL || !config.apiKey) throw new ModerationUnavailable();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, ...MODEL_OPTIONS, stream: false,
        messages: [{ role: "system", content: POLICY }, { role: "user", content: JSON.stringify(input) }],
        response_format: { type: "json_schema", json_schema: { name: "school_moderation", strict: true, schema: VERDICT_SCHEMA } },
      }),
    });
    if (!response.ok) {
      const retry = Number(response.headers.get("retry-after"));
      throw new ModerationUnavailable(Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.ceil(retry)) : 15);
    }
    const body = await response.json();
    const choice = body?.choices?.[0];
    if (controller.signal.aborted || choice?.finish_reason !== "stop" || choice.message?.refusal || typeof choice.message?.content !== "string") throw new ModerationUnavailable();
    const verdict = JSON.parse(choice.message.content);
    if (!verdict || Object.keys(verdict).sort().join() !== "decision,reasons" || !["allow", "reject", "uncertain"].includes(verdict.decision) || !Array.isArray(verdict.reasons) || verdict.reasons.length > REASONS.length || verdict.reasons.some((reason: unknown) => !REASONS.includes(reason as typeof REASONS[number])) || (verdict.decision === "allow") !== (verdict.reasons.length === 0)) throw new ModerationUnavailable();
    return { decision: verdict.decision, reasons: [...new Set(verdict.reasons)] } as ModelVerdict;
  } catch (cause) {
    throw cause instanceof ModerationUnavailable ? cause : new ModerationUnavailable();
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
