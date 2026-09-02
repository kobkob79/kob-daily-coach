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
/**
 * The only frame rate value the approved V1 standard and the follow-up
 * migration's relaxed DB CHECK ever accept as *verified*
 * (`frame_rate is null or frame_rate = 30`). NULL means "not yet
 * verified" and is a legitimate, honest state for a Draft uploaded
 * through the current Admin flow - see exercise-motion-draft-core.ts.
 */
export const MOTION_VIDEO_REQUIRED_FRAME_RATE = 30;

/**
 * VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001: V1 uses exactly one
 * official generic exercise demonstrator. This supersedes every prior
 * daniel/maya alternation, odd/even Core 150 assignment, muscle-group
 * assignment, manual per-exercise assignment, user-selectable variant, and
 * `ortal` as a possible demonstrator. Kept as a single-element array/union
 * (not a bare string literal) so a future decision to add official
 * demonstrators back is a one-line widening here plus a migration, not a
 * data-model change - without exposing an unused choice today.
 */
export const DEMONSTRATOR_KEYS = ["generic"] as const;
export type DemonstratorKey = (typeof DEMONSTRATOR_KEYS)[number];
export const DEFAULT_DEMONSTRATOR_KEY: DemonstratorKey = "generic";

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
  | "invalid_mime_type"
  | "file_too_large"
  | "wrong_resolution"
  | "duration_out_of_range"
  | "invalid_frame_rate";

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
  invalid_frame_rate: "קצב הפריימים שסופק אינו תקין. יש להשאיר לא מאומת או לספק בדיוק 30fps.",
  needs_confirmation: "כבר קיימת טיוטה לתרגיל זה. יש לאשר את ההחלפה כדי להמשיך.",
  conflict_non_draft:
    "לתרגיל זה כבר יש גרסה בתהליך שאינה טיוטה. לא ניתן להעלות כעת - נדרש טיפול ידני.",
  uploading: "מעלה...",
  upload_failed: "ההעלאה נכשלה. נסו שוב.",
  draft_saved: "הטיוטה נשמרה בהצלחה.",
} as const;

export type MotionDraftMessageKey = keyof typeof MOTION_DRAFT_MESSAGES_HE;

// ============================================================================
// VIORA-EXERCISE-MOTION-VIDEO-QUALITY-GATE-001
//
// A visible automatic PASS/FAIL report, a mandatory manual visual-review
// checklist, and an honest "not yet verified" section for properties no
// browser can inspect. Framework-free, like the rest of this module -
// MotionVideoDraftSheet.tsx renders these, it does not compute them.
// ============================================================================

export type AutomaticCheckId = "mime_type" | "file_size" | "resolution" | "duration";

export interface AutomaticCheckStatus {
  id: AutomaticCheckId;
  /** Hebrew label naming the check itself (e.g. "סוג קובץ MP4"). */
  label: string;
  passed: boolean;
  /** The detected value, formatted for display (e.g. "1280×720", "2.14MB"). */
  detail: string;
}

/**
 * Maps the errors `validateDetectedMotionVideoMetadata()` already computed
 * into one visible status row per automatic check - PASS (green) or FAIL
 * (red) - with the detected value shown alongside. Takes `errors` as an
 * input rather than recomputing them, so there is exactly one validation
 * implementation in this module; callers must pass the same array they got
 * from `validateDetectedMotionVideoMetadata(detected)`.
 */
export function mapValidationErrorsToAutomaticChecks(
  detected: DetectedMotionVideoMetadata,
  errors: readonly MotionDraftValidationError[],
): AutomaticCheckStatus[] {
  const codes = new Set(errors.map((e) => e.code));
  const sizeMb = (detected.sizeBytes / (1024 * 1024)).toFixed(2);
  const maxMb = (MOTION_VIDEO_MAX_BYTES / (1024 * 1024)).toFixed(0);

  return [
    {
      id: "mime_type",
      label: "סוג קובץ MP4 (video/mp4)",
      passed: !codes.has("invalid_mime_type"),
      detail: detected.mimeType || "לא זוהה סוג קובץ",
    },
    {
      id: "file_size",
      label: `גודל קובץ עד ${maxMb}MB`,
      passed: !codes.has("file_too_large"),
      detail: `${sizeMb}MB`,
    },
    {
      id: "resolution",
      label: `רזולוציה ${MOTION_VIDEO_WIDTH}×${MOTION_VIDEO_HEIGHT}`,
      passed: !codes.has("wrong_resolution"),
      detail: `${detected.width}×${detected.height}`,
    },
    {
      id: "duration",
      label: `משך ${MOTION_VIDEO_MIN_DURATION_MS / 1000}–${MOTION_VIDEO_MAX_DURATION_MS / 1000} שניות`,
      passed: !codes.has("duration_out_of_range"),
      detail: `${(detected.durationMs / 1000).toFixed(1)} שניות`,
    },
  ];
}

export interface ManualReviewItem {
  id: string;
  /** Hebrew checklist text, verbatim per the sprint. */
  label: string;
}

/**
 * The mandatory Admin visual-review checklist. Order matches the sprint
 * spec. Every item is required - see isManualReviewComplete().
 */
export const MOTION_VIDEO_MANUAL_REVIEW_ITEMS: readonly ManualReviewItem[] = [
  { id: "in_frame", label: "הראש וכל הגוף נשארים בתוך המסגרת לאורך כל הסרטון." },
  {
    id: "matches_hero",
    label: "תנוחת הגוף, זווית הצילום והציוד תואמים לתמונת ה־Hero המאושרת.",
  },
  {
    id: "no_invented_props",
    label: "לא נוספו ספסל, כיסא, ציוד או עצמים שלא קיימים בתמונת המקור.",
  },
  {
    id: "character_consistent",
    label: "הדמות נשארת עקבית ללא שינוי פנים, גוף, לבוש או אנטומיה.",
  },
  { id: "biomechanics_sound", label: "התנועה נראית ביומכנית תקינה ומתאימה לתרגיל." },
  { id: "loops_smoothly", label: "תחילת הסרטון וסופו מאפשרים לולאה חלקה." },
] as const;

export type ManualReviewItemId = (typeof MOTION_VIDEO_MANUAL_REVIEW_ITEMS)[number]["id"];

export type ManualReviewConfirmations = Record<ManualReviewItemId, boolean>;

/** All checklist items unconfirmed - the required state after a reset. */
export function createEmptyManualReviewConfirmations(): ManualReviewConfirmations {
  const confirmations = {} as ManualReviewConfirmations;
  for (const item of MOTION_VIDEO_MANUAL_REVIEW_ITEMS) {
    confirmations[item.id] = false;
  }
  return confirmations;
}

/** True only when every mandatory checklist item is confirmed. */
export function isManualReviewComplete(confirmations: ManualReviewConfirmations): boolean {
  return MOTION_VIDEO_MANUAL_REVIEW_ITEMS.every((item) => confirmations[item.id] === true);
}

export interface UnverifiedProperty {
  id: "codec" | "frame_rate" | "no_audio_track";
  /** Hebrew label naming the property. Deliberately carries no `passed` field - see the module doc. */
  label: string;
}

/**
 * Properties no browser (and no part of the current upload pipeline - see
 * exercise-motion-draft-core.ts) can reliably inspect. Deliberately typed
 * without a `passed`/`detail` field: there is no PASS state for these, and
 * nothing here may ever claim one. Their unverified state does not block
 * saving as Draft, but a Draft with any of these unconfirmed must never
 * reach qa_passed/published - that gate is future privileged-QA-service
 * work, not this sheet's job.
 */
export const MOTION_VIDEO_UNVERIFIED_PROPERTIES: readonly UnverifiedProperty[] = [
  { id: "codec", label: "קודק H.264" },
  { id: "frame_rate", label: "קצב 30 פריימים לשנייה" },
  { id: "no_audio_track", label: "ללא ערוץ אודיו" },
] as const;

/**
 * The Draft upload button's gate: every automatic check must pass AND
 * every manual-review item must be confirmed. Unverified technical
 * properties (codec/fps/audio) are never part of this gate - they may
 * still allow saving as Draft, per the sprint.
 */
export function isMotionDraftReadyToUpload(
  automaticChecks: readonly AutomaticCheckStatus[],
  confirmations: ManualReviewConfirmations,
): boolean {
  return automaticChecks.every((check) => check.passed) && isManualReviewComplete(confirmations);
}
