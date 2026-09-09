/**
 * Safe server-error reporting (VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001,
 * finding F4).
 *
 * A raw Supabase/Postgres error's `message`/`code`/`details`/`hint` can
 * carry sensitive detail (a Storage path, a signed-URL token, a table/
 * column name, a constraint definition) that must never reach the
 * client's toast or this app's own log stream verbatim. Every server
 * function that talks to Storage/Postgres should catch its own error,
 * discard it entirely, and report only one of the fixed categories below -
 * this module is the single place that turns a category into (a) what
 * gets logged and (b) the generic Hebrew message the client is allowed to
 * see.
 *
 * Deliberately typed so a raw error object *cannot* be passed through: the
 * only inputs are the closed category enum and a small allowlist of
 * already-known-safe identifiers (an exercise id, a role name - never a
 * Storage path, token, or anything derived from the error itself).
 */

export type SafeErrorCategory =
  | "VALIDATION_FAILED"
  | "FORBIDDEN"
  | "SOURCE_NOT_FOUND"
  | "LIST_FAILED"
  | "UPLOAD_FAILED"
  | "CLEANUP_FAILED";

const SAFE_ERROR_MESSAGES_HE: Record<SafeErrorCategory, string> = {
  VALIDATION_FAILED: "הבקשה אינה תקינה.",
  FORBIDDEN: "אין הרשאה לבצע פעולה זו.",
  SOURCE_NOT_FOUND: "הקובץ המקורי לא נמצא.",
  LIST_FAILED: "לא ניתן היה לבדוק את המדיה הקיימת לתרגיל. נסו שוב.",
  UPLOAD_FAILED: "ההעלאה נכשלה. נסו שוב.",
  CLEANUP_FAILED: "השיוך הצליח, אך נדרש ניקוי חוזר של קובץ ישן.",
};

/** Fields that are safe to log/return: never a Storage path, token, signed URL, or anything the raw error produced. */
export interface SafeErrorContext {
  exerciseId?: string;
  role?: string;
}

export interface SafeServerError {
  category: SafeErrorCategory;
  correlationId: string;
  /** Generic, safe Hebrew message - the only text ever shown to the client for this failure. */
  message: string;
}

function randomCorrelationId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Logs exactly the category, a correlation id, and (only) the known-safe
 * context fields - never a raw error object, its message/code/details/
 * hint/stack, nor any Storage path/token/signed URL/payload - and returns
 * the safe object the caller should throw or return to the client.
 */
export function reportSafeServerError(
  category: SafeErrorCategory,
  context?: SafeErrorContext,
): SafeServerError {
  const correlationId = randomCorrelationId();
  console.error(`[exercise-media] ${category}`, {
    correlationId,
    exerciseId: context?.exerciseId,
    role: context?.role,
  });
  return { category, correlationId, message: SAFE_ERROR_MESSAGES_HE[category] };
}
