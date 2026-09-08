/**
 * Coach Debrief — safe error handling and structured-output validation.
 *
 * Pure module, deliberately free of any `openai` or `advisor-core/server/*`
 * value imports so it stays importable from client code (the debrief route)
 * without pulling server-only dependencies into the browser bundle, and so
 * it's trivially unit-testable with plain objects — no live OpenAI call, no
 * constructed SDK error instances required.
 *
 * Nothing here ever touches a prompt, workout context, health data, or a
 * raw provider error body — every function's parameter list is the safety
 * boundary: there is no argument through which sensitive data could pass.
 */
import type { AdvisorCoreErrorCode } from "@/lib/advisor-core/response";
import type { CoachDebrief } from "@/lib/coach-debrief.functions";

export type DebriefErrorCategory =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "BILLING_OR_QUOTA"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "MODEL_ACCESS"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "PROVIDER_UNAVAILABLE";

/** Approved, static Hebrew copy — the only user-facing text a failure may ever produce. */
export const DEBRIEF_SAFE_MESSAGES: Record<DebriefErrorCategory, string> = {
  NOT_CONFIGURED: "התחקיר האישי אינו זמין כרגע. הנתונים של האימון נשמרו במלואם.",
  AUTH_FAILED: "התחקיר האישי אינו זמין כרגע. הנתונים של האימון נשמרו במלואם.",
  BILLING_OR_QUOTA: "אזלו זיכויי ה-AI — התחקיר האישי יחזור ברגע שהזיכויים יתחדשו.",
  RATE_LIMITED: "יש עומס זמני על שירות ה-AI — נסה שוב בעוד רגע.",
  TIMEOUT: "לקח יותר מדי זמן להפיק את התחקיר — נסה שוב.",
  MODEL_ACCESS: "התחקיר האישי אינו זמין כרגע. הנתונים של האימון נשמרו במלואם.",
  INVALID_REQUEST: "לא הצלחתי להפיק תחקיר כרגע. הנתונים של האימון נשמרו במלואם.",
  INVALID_RESPONSE: "לא הצלחתי להפיק תחקיר תקין כרגע — נסה שוב.",
  PROVIDER_UNAVAILABLE: "שירות ה-AI אינו זמין כרגע — נסה שוב בעוד רגע.",
};

export interface DebriefFailure {
  status: "error";
  category: DebriefErrorCategory;
  /** Always one of DEBRIEF_SAFE_MESSAGES' values — never a raw provider/error message. */
  message: string;
  correlationId: string;
}

export type CoachDebriefResult = { status: "ok"; debrief: CoachDebrief } | DebriefFailure;

/** Short, random, non-sequential — carries no information about the request itself. */
export function createCorrelationId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `dbg_${rand}`;
}

export function buildDebriefFailure(
  category: DebriefErrorCategory,
  correlationId: string = createCorrelationId(),
): DebriefFailure {
  return { status: "error", category, message: DEBRIEF_SAFE_MESSAGES[category], correlationId };
}

/**
 * Maps the shared Advisor OpenAI error classification (classifyOpenAIAPIError
 * in advisor-core/server/providers/openai-provider.server.ts) onto Coach
 * Debrief's own safe categories, instead of re-deriving status/code rules —
 * the caller runs classifyOpenAIAPIError itself (it needs the live OpenAI
 * SDK types) and hands the resulting code here.
 */
export function mapAdvisorErrorCodeToDebriefCategory(
  code: AdvisorCoreErrorCode,
): DebriefErrorCategory {
  switch (code) {
    case "OPENAI_AUTH_FAILURE":
      return "AUTH_FAILED";
    case "OPENAI_INSUFFICIENT_QUOTA":
      return "BILLING_OR_QUOTA";
    case "OPENAI_MODEL_ACCESS_FAILURE":
      return "MODEL_ACCESS";
    case "OPENAI_RATE_LIMIT":
      return "RATE_LIMITED";
    case "OPENAI_BAD_REQUEST":
      return "INVALID_REQUEST";
    case "MISSING_OPENAI_CONFIGURATION":
      return "NOT_CONFIGURED";
    default:
      return "PROVIDER_UNAVAILABLE";
  }
}

export interface DebriefLogFields {
  correlationId: string;
  category?: DebriefErrorCategory;
  httpStatus?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
  model: string;
  durationMs: number;
}

/**
 * Server-side-only diagnostic log. The parameter type is the safety
 * guarantee: every field is an allow-listed primitive (an id, a category
 * name, a status code, a duration) — there is no field here a prompt,
 * workout context, health data, or an API key could ever occupy.
 */
export function logDebriefOutcome(outcome: "ok" | "error", fields: DebriefLogFields): void {
  const log = outcome === "ok" ? console.info : console.error;
  log("[Coach Debrief]", { outcome, ...fields });
}

// --- Structured-output schema + a runtime validator that mirrors it exactly ---

/** Sent as the Responses API's `text.format.schema` with `strict: true`. */
export const COACH_DEBRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    greeting: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
    nextFocus: { type: ["string", "null"] },
    recovery: { type: ["string", "null"] },
    nutrition: { type: ["string", "null"] },
    hydration: { type: ["string", "null"] },
  },
  required: [
    "greeting",
    "paragraphs",
    "highlights",
    "nextFocus",
    "recovery",
    "nutrition",
    "hydration",
  ],
  additionalProperties: false,
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * Structural mirror of COACH_DEBRIEF_JSON_SCHEMA — every property/required
 * field declared there has exactly one corresponding check below. Returns
 * null (→ INVALID_RESPONSE) for a refusal, empty output, or any shape that
 * doesn't match, rather than silently defaulting missing fields.
 */
export function validateCoachDebriefShape(value: unknown): CoachDebrief | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.greeting !== "string" || !v.greeting.trim()) return null;
  if (!isStringArray(v.paragraphs)) return null;
  if (!isStringArray(v.highlights)) return null;
  if (!isNullableString(v.nextFocus)) return null;
  if (!isNullableString(v.recovery)) return null;
  if (!isNullableString(v.nutrition)) return null;
  if (!isNullableString(v.hydration)) return null;

  return {
    greeting: v.greeting.trim(),
    paragraphs: v.paragraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 5),
    highlights: v.highlights
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 3),
    nextFocus: v.nextFocus?.trim() || null,
    recovery: v.recovery?.trim() || null,
    nutrition: v.nutrition?.trim() || null,
    hydration: v.hydration?.trim() || null,
  };
}
