export const SAFE_FAILURE_CATEGORIES = new Set([
  "NOT_FOUND",
  "RETRY_NOT_ALLOWED",
  "QUOTA_UNAVAILABLE",
  "DAILY_QUOTA_EXCEEDED",
  "PERSISTENCE_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "OPENAI_AUTH_FAILURE",
  "OPENAI_INSUFFICIENT_QUOTA",
  "OPENAI_MODEL_ACCESS_FAILURE",
  "OPENAI_RATE_LIMIT",
  "OPENAI_BAD_REQUEST",
  "OPENAI_PROVIDER_FAILURE",
  "OPENAI_CONNECTION_TIMEOUT",
  "OPENAI_CONNECTION_FAILURE",
  "EMPTY_MODEL_RESPONSE",
]);

export type SafeOperation = "list" | "create" | "getMessages" | "rename" | "delete" | "send";

export function failureCategory(error: unknown): string {
  const name = error instanceof Error ? error.message : "unknown";
  return SAFE_FAILURE_CATEGORIES.has(name) ? name : "unhandled_exception";
}

export function unavailable(operation: SafeOperation, error?: unknown) {
  const correlationId = globalThis.crypto.randomUUID().slice(0, 8);
  console.error("[Viora Advisor Conversations]", {
    event: "advisor_persistence_unavailable",
    operation,
    failure_category: failureCategory(error),
    correlation_id: correlationId,
  });
  return {
    status: "error" as const,
    error: { code: "PERSISTENCE_UNAVAILABLE" as const, retryable: true, correlationId },
  };
}
