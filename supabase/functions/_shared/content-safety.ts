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
const BUILTIN_FORBIDDEN_TERMS = ["bunuh diri", "pornografi"] as const;
const RULE_VERSION = "contact-v1";

const normalizeTerm = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("id-ID");
const codePoints = (value: string) => [...value].length;

export function readSafetyConfig(getEnv: (key: string) => string | undefined): SafetyConfig {
  const configured = getEnv("CONTENT_SAFETY_FORBIDDEN_TERMS");
  const forbiddenTerms = configured === undefined
    ? [...BUILTIN_FORBIDDEN_TERMS]
    : configured.split(",").map(normalizeTerm).filter(Boolean);
  if (forbiddenTerms.length === 0 || forbiddenTerms.some((term) => codePoints(term) > 80) || forbiddenTerms.length > 200) {
    throw new Error("Invalid content safety configuration");
  }
  return { forbiddenTerms: [...new Set(forbiddenTerms)].sort(), minCodePoints: 10, maxCodePoints: 500 };
}

export async function safetyPolicyVersion(content: SafetyConfig, recipient: SafetyConfig): Promise<string> {
  const canonical = JSON.stringify({
    rules: RULE_VERSION,
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
  if (config.forbiddenTerms.some((term) => folded.includes(term))) reasons.push("forbidden_term");
  const policyVersion = await safetyPolicyVersion(config, config);
  return reasons.length ? { approved: false, code: "CONTENT_UNSAFE", reasons: [...new Set(reasons)], policyVersion } : { approved: true, policyVersion };
}
