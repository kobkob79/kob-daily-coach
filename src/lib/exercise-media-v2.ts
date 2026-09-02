/**
 * Exercise Media V2 — Motion Video shared constants and pure helpers.
 *
 * Framework-free on purpose: no Supabase client, no React, no TanStack
 * imports. This module is imported both by the browser (for instant local
 * validation before any network call) and by the trusted server function
 * (for the authoritative check), so the two must agree byte-for-byte on
 * limits and messages. It is also imported directly by
 * exercise-media-v2.test.ts via a relative path and run with Node's
 * built-in test runner (`node --test`) - no bundler, no test framework
 * dependency.
 */

export const MOTION_VIDEO_MIME_TYPE = "video/mp4";
export const MOTION_VIDEO_MAX_BYTES = 3 * 1024 * 1024; // 3 MiB (3,145,728), matches the DB CHECK exactly.
export const MOTION_VIDEO_WIDTH = 1280;
export const MOTION_VIDEO_HEIGHT = 720;
export const MOTION_VIDEO_MIN_DURATION_MS = 6000;
export const MOTION_VIDEO_MAX_DURATION_MS = 10000;
export const MOTION_VIDEO_TARGET_DURATION_MS = 8000;
/** Required frame rate per the approved V1 standard and the DB CHECK. Not a value this module can ever produce - see exercise-motion-draft-core.ts. */
export const MOTION_VIDEO_REQUIRED_FRAME_RATE = 30;

export const DEMONSTRATOR_KEYS = ["daniel", "maya"] as const;
export type DemonstratorKey = (typeof DEMONSTRATOR_KEYS)[number];

/** The eight `exercise_media_versions.status` values, as merged in PR #3. */
export const WORKING_STATUSES = [
  "draft",
  "media_ready",
  "qa_passed",
  "rejected",
  "replacement_required",
] as const;
export type WorkingStatus = (typeof WORKING_STATUSES)[number];

export function isDraftStatus(status: string): boolean {
  return status === "draft";
}

export function isWorkingStatus(status: string): status is WorkingStatus {
  return (WORKING_STATUSES as readonly string[]).includes(status);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict validator for every path/query component derived from client input. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * The versioned V2 storage path, scoped under a `v2/` segment so it can
 * never collide with the legacy `thumbnail`/`main`/`guide`/`demo` files
 * living directly under `exercises/<exerciseId>/`.
 *
 * `replacementToken`, when given, produces a second, distinct path used
 * only during a Draft replacement: the new file is uploaded there first,
 * the asset row is switched to point at it, and only then is the old
 * object removed - see exercise-motion-draft-core.ts's replace flow.
 */
export function buildMotionVideoStoragePath(
  exerciseId: string,
  mediaVersionId: string,
  replacementToken?: string,
): string {
  if (!isUuid(exerciseId)) throw new Error("Invalid exerciseId for storage path");
  if (!isUuid(mediaVersionId)) throw new Error("Invalid mediaVersionId for storage path");
  if (replacementToken !== undefined && !/^[0-9a-f-]{1,40}$/i.test(replacementToken)) {
    throw new Error("Invalid replacement token for storage path");
  }
  const fileName = replacementToken ? `motion.${replacementToken}.mp4` : "motion.mp4";
  return `exercises/${exerciseId}/v2/${mediaVersionId}/${fileName}`;
}

export interface DetectedMotionVideoMetadata {
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationMs: number;
}

export type MotionDraftValidationErrorCode =
  "invalid_mime_type" | "file_too_large" | "wrong_resolution" | "duration_out_of_range";

export interface MotionDraftValidationError {
  code: MotionDraftValidationErrorCode;
  message: string;
}

/**
 * The four properties the Important Validation Boundary says a browser (or
 * a server that only inspects the raw bytes, never decodes them) may
 * actually check: MIME type, file size, width, height, duration. Frame
 * rate is deliberately absent - see MOTION_VIDEO_REQUIRED_FRAME_RATE.
 */
export function validateDetectedMotionVideoMetadata(
  detected: DetectedMotionVideoMetadata,
): MotionDraftValidationError[] {
  const errors: MotionDraftValidationError[] = [];

  if (detected.mimeType !== MOTION_VIDEO_MIME_TYPE) {
    errors.push({
      code: "invalid_mime_type",
      message: MOTION_DRAFT_MESSAGES_HE.invalid_mime_type,
    });
  }
  if (detected.sizeBytes > MOTION_VIDEO_MAX_BYTES || detected.sizeBytes <= 0) {
    errors.push({ code: "file_too_large", message: MOTION_DRAFT_MESSAGES_HE.file_too_large });
  }
  if (detected.width !== MOTION_VIDEO_WIDTH || detected.height !== MOTION_VIDEO_HEIGHT) {
    errors.push({ code: "wrong_resolution", message: MOTION_DRAFT_MESSAGES_HE.wrong_resolution });
  }
  if (
    detected.durationMs < MOTION_VIDEO_MIN_DURATION_MS ||
    detected.durationMs > MOTION_VIDEO_MAX_DURATION_MS
  ) {
    errors.push({
      code: "duration_out_of_range",
      message: MOTION_DRAFT_MESSAGES_HE.duration_out_of_range,
    });
  }

  return errors;
}

/** Hebrew copy for every UX state item 11 of the sprint requires. */
export const MOTION_DRAFT_MESSAGES_HE = {
  invalid_mime_type: "יש להעלות קובץ MP4 בלבד.",
  file_too_large: "הקובץ גדול מדי. הגודל המרבי המותר הוא 3MB.",
  wrong_resolution: "רזולוציית הווידאו חייבת להיות 1280×720 (16:9).",
  duration_out_of_range: "משך הווידאו חייב להיות בין 6 ל-10 שניות.",
  needs_confirmation: "כבר קיימת טיוטה לתרגיל זה. יש לאשר את ההחלפה כדי להמשיך.",
  conflict_non_draft:
    "לתרגיל זה כבר יש גרסה בתהליך שאינה טיוטה. לא ניתן להעלות כעת - נדרש טיפול ידני.",
  uploading: "מעלה...",
  upload_failed: "ההעלאה נכשלה. נסו שוב.",
  draft_saved: "הטיוטה נשמרה בהצלחה.",
  architectural_blocker:
    "לא ניתן לאמת את קצב הפריימים (frame rate) בסביבה הנוכחית, ובסיס הנתונים דורש ערך מאומת. הפעולה נעצרה ובוטלה במלואה - שום דבר לא נשמר.",
  forbidden: "אין הרשאת מנהל לפעולה זו.",
} as const;

export type MotionDraftMessageKey = keyof typeof MOTION_DRAFT_MESSAGES_HE;

/**
 * Deterministic editorial demonstrator default. `core150Number` is the
 * exercise's stable position in the Core 150 catalogue - a concept the
 * running schema does not currently persist anywhere (no ordinal/number
 * column exists on `public.exercises`; see exercise-motion-draft-core.ts's
 * resolveCore150Number, which therefore always resolves to null today).
 * When it cannot be resolved, the sprint's own fallback rule applies.
 */
export function resolveDemonstratorDefault(core150Number: number | null): DemonstratorKey {
  if (core150Number === null) return "daniel";
  return core150Number % 2 === 0 ? "maya" : "daniel";
}
