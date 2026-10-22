import { MODEL, MODEL_OPTIONS, POLICY, VERDICT_SCHEMA } from "./moderation-policy.ts";
import type { ModerationInput } from "./moderation-policy.ts";
export type SafetyConfig = {
  forbiddenTerms: string[];
  minCodePoints: number;
  maxCodePoints: number;
};

export type SafetyResult =
  | { approved: true; policyVersion: string }
  | { approved: false; code: "CONTENT_UNSAFE"; reasons: string[]; policyVersion: string };

const CONTACT_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
  ["phone", /(?:\+?62|0)[\s().-]*(?:\d[\s().-]*){8,13}\b/u],
  ["url", /(?:https?:\/\/|www\.)\S+/iu],
  ["social_handle", /(^|\s)@[A-Z0-9._]{3,30}\b/iu],
];
const BUILTIN_FORBIDDEN_TERMS = ["kontol", "ngentot", "memek"] as const;
const RULE_VERSION = "school-context-v2";

const normalizeTerm = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("id-ID");
const codePoints = (value: string) => [...value].length;

export function readSafetyConfig(getEnv: (key: string) => string | undefined): SafetyConfig {
  const configured = getEnv("CONTENT_SAFETY_FORBIDDEN_TERMS");
  const forbiddenTerms = configured === undefined
    ? [...BUILTIN_FORBIDDEN_TERMS]
    : [...BUILTIN_FORBIDDEN_TERMS, ...configured.split(",").map(normalizeTerm).filter(Boolean)];
  if (configured?.trim() === "" || forbiddenTerms.some((term) => codePoints(term) > 80) || forbiddenTerms.length > 200) {
    throw new Error("Invalid content safety configuration");
  }
  return { forbiddenTerms: [...new Set(forbiddenTerms)].sort(), minCodePoints: 10, maxCodePoints: 500 };
}

export async function safetyPolicyVersion(content: SafetyConfig, recipient: SafetyConfig, revision = "school-v1"): Promise<string> {
  const canonical = JSON.stringify({
    rules: RULE_VERSION,
    ai: { model: MODEL, options: MODEL_OPTIONS, prompt: POLICY, schema: VERDICT_SCHEMA, revision },
    contactPatterns: CONTACT_PATTERNS.map(([name, pattern]) => [name, pattern.source, pattern.flags]),
    fields: { content, recipient },
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `v1:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function evaluateContentSafety(content: string, config: SafetyConfig): Promise<SafetyResult> {
  const reasons: string[] = [];
  const length = codePoints(content);
  if (length < config.minCodePoints || length > config.maxCodePoints) reasons.push("length");
  for (const [name, pattern] of CONTACT_PATTERNS) if (pattern.test(content)) reasons.push(name);
  const folded = content.normalize("NFC").toLocaleLowerCase("id-ID");
  const normalized = normalizeForSafety(content);
  if (config.forbiddenTerms.some(term => containsTerm(normalized, normalizeForSafety(term)))) reasons.push("forbidden_term");
  // Ambiguous animal names go to AI unless their spelling explicitly hides a direct insult.
  if (normalized !== folded && /(?:^|\s)(?:kamu|lu|lo|kowe)\s+(?:anjing|asu)(?:\s|$)/u.test(normalized)) reasons.push("forbidden_term");
  const policyVersion = await safetyPolicyVersion(config, config);
  return reasons.length ? { approved: false, code: "CONTENT_UNSAFE", reasons: [...new Set(reasons)], policyVersion } : { approved: true, policyVersion };
}

export function normalizeForSafety(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/[\u200B-\u200F\u2060\uFEFF]/gu, "")
    .replace(/[01345@]/g, char => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a" })[char]!)
    .replace(/([\p{L}])\1{2,}/gu, "$1")
    .replace(/\b(?:[a-z][.\-_]){2,}[a-z]\b/gu, word => word.replace(/[.\-_]/g, ""));
}
function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
}
export async function contentFingerprint(input: ModerationInput): Promise<string> {
  const canonical = JSON.stringify({ category: input.category, recipient: input.recipient, content: input.content });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function assertPublishableModeration(input: ModerationInput, approval: { decision: string; contentHash: string; policyVersion: string }, currentPolicyVersion: string): Promise<void> {
  if (!approval || approval.decision !== "allow" || approval.policyVersion !== currentPolicyVersion || approval.contentHash !== await contentFingerprint(input)) throw new Error("MODERATION_REQUIRED");
}
