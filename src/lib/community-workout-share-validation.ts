/**
 * Strict input validation for the Workout Share Studio publish/find server
 * functions (Codex review finding 2, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Pure module — no "@/" aliased imports — so it's importable both from
 * community-workout-share.functions.ts (which ships to the client bundle
 * and needs requireSupabaseAuth) and directly from a colocated node --test
 * suite, which can't resolve that Vite-only alias.
 */
import { z } from "zod";
import {
  COACH_MAX_PARAGRAPH_LENGTH,
  COACH_MAX_PARAGRAPHS,
  WORKOUT_SHARE_CAPTION_MAX_LENGTH,
} from "./community-workout-share.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** No C0/C1 control characters (multi-line text is fine — a caption is a Textarea). */
// eslint-disable-next-line no-control-regex -- intentional exclusion, not accidental
const NO_CONTROL_CHARS_MULTILINE = /^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/;
/** Single-line labels never need a newline/tab either. */
// eslint-disable-next-line no-control-regex -- intentional exclusion, not accidental
const NO_CONTROL_CHARS_SINGLE_LINE = /^[^\x00-\x1F\x7F]*$/;
/** `<uuid>/<uuid>.<ext>` — the exact convention every photo upload in this app already follows. */
const OWN_FOLDER_PHOTO_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{1,80}\.(jpg|jpeg|png|webp)$/i;

export const sessionIdSchema = z.object({ sessionId: z.string().regex(UUID_RE) }).strict();

export const publishInputSchema = z
  .object({
    sessionId: z.string().regex(UUID_RE),
    caption: z.string().max(2000).regex(NO_CONTROL_CHARS_MULTILINE).nullable(),
    photoPath: z.string().max(160).regex(OWN_FOLDER_PHOTO_PATH_RE).nullable(),
    audience: z.enum(["public", "followers"]),
    locationLabel: z.string().max(120).regex(NO_CONTROL_CHARS_SINGLE_LINE).nullable(),
    includeCoach: z.boolean(),
  })
  .strict();

export type PublishWorkoutShareInput = z.infer<typeof publishInputSchema>;

/**
 * Runtime shape check for a `community_posts.payload` value read back out of
 * the database (Codex review finding 10). This module only ever WRITES a
 * payload it built itself, but the feed READS whatever is stored under that
 * row — a future migration, a manual DB edit, or a payload written before a
 * shape change could all put something on screen that no longer matches
 * `WorkoutSharePayloadV1`. Rendering an untyped `payload` (jsonb — no schema
 * enforcement of its own) is treated the same as any other externally
 * supplied data: parsed and rejected, never cast straight to a TS type.
 */
// Bounds below (Codex re-review round 2, blocker 5) are sanity limits
// matching what buildWorkoutSharePayload() itself can actually produce —
// generous enough to never reject a real payload, tight enough that a
// corrupted/tampered jsonb row can't push an arbitrarily large or
// nonsensical structure into the feed. A weight/volume/rep count is
// always a non-negative real-world number for a workout a person actually
// did; a set/rep/exercise COUNT is always a non-negative integer.
const MAX_TEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 120;
const MAX_WEIGHT_KG = 2000;
const MAX_REPS = 2000;
const MAX_VOLUME_KG = 1_000_000;
const MAX_SET_COUNT = 2000;
const MAX_EXERCISES = 200;
const MAX_SETS_PER_EXERCISE = 200;
const MAX_MUSCLE_GROUPS = 50;
/** greeting + up to COACH_MAX_PARAGRAPHS paragraphs. */
const MAX_COACH_FULL_ENTRIES = COACH_MAX_PARAGRAPHS + 1;
/** Generous upper bound for coachSummary's "greeting + up to 2 highlights" join — each part is already capped at COACH_MAX_PARAGRAPH_LENGTH by the builder. */
const MAX_COACH_SUMMARY_LENGTH = COACH_MAX_PARAGRAPH_LENGTH * 3 + 20;

const nonNegInt = (max: number) => z.number().finite().int().min(0).max(max);
const nonNegFinite = (max: number) => z.number().finite().min(0).max(max);
const boundedText = (max: number) => z.string().max(max);

const workoutShareExerciseSetSchema = z
  .object({
    weightKg: nonNegFinite(MAX_WEIGHT_KG).nullable(),
    reps: nonNegInt(MAX_REPS).nullable(),
  })
  .strict();

const workoutShareExerciseSchema = z
  .object({
    name: boundedText(MAX_NAME_LENGTH),
    sets: z.array(workoutShareExerciseSetSchema).max(MAX_SETS_PER_EXERCISE),
  })
  .strict();

const workoutShareBestSetSchema = z
  .object({
    exerciseName: boundedText(MAX_NAME_LENGTH),
    weightKg: nonNegFinite(MAX_WEIGHT_KG),
    reps: nonNegInt(MAX_REPS),
    volumeKg: nonNegFinite(MAX_VOLUME_KG),
  })
  .strict();

export const workoutSharePayloadSchema = z
  .object({
    version: z.literal(1),
    workoutName: boundedText(MAX_TEXT_LENGTH).nullable(),
    dateISO: z.string().datetime({ offset: true }),
    durationMinutes: nonNegInt(24 * 60).nullable(),
    isPartial: z.boolean(),
    completedSetCount: nonNegInt(MAX_SET_COUNT),
    plannedSetCount: nonNegInt(MAX_SET_COUNT),
    totalReps: nonNegInt(MAX_SET_COUNT * 50),
    totalVolumeKg: nonNegFinite(MAX_VOLUME_KG),
    bestSet: workoutShareBestSetSchema.nullable(),
    primaryMuscleGroups: z.array(boundedText(MAX_NAME_LENGTH)).max(MAX_MUSCLE_GROUPS),
    exercises: z.array(workoutShareExerciseSchema).max(MAX_EXERCISES),
    coachSummary: boundedText(MAX_COACH_SUMMARY_LENGTH).nullable(),
    coachFull: z
      .array(boundedText(COACH_MAX_PARAGRAPH_LENGTH))
      .max(MAX_COACH_FULL_ENTRIES)
      .nullable(),
    caption: boundedText(WORKOUT_SHARE_CAPTION_MAX_LENGTH).nullable(),
    locationLabel: boundedText(120).nullable(),
  })
  .strict();

/**
 * Never throws — a malformed/unknown-version payload becomes `null`, which
 * callers treat as "this post has no renderable structured content" rather
 * than crashing the whole feed over one bad row.
 */
export function parseWorkoutSharePayload(value: unknown): WorkoutSharePayloadParsed | null {
  const result = workoutSharePayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}

export type WorkoutSharePayloadParsed = z.infer<typeof workoutSharePayloadSchema>;
