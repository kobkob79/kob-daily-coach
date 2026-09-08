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
const finiteNumber = z.number().finite();

const workoutShareExerciseSetSchema = z
  .object({
    weightKg: finiteNumber.nullable(),
    reps: finiteNumber.nullable(),
  })
  .strict();

const workoutShareExerciseSchema = z
  .object({
    name: z.string(),
    sets: z.array(workoutShareExerciseSetSchema),
  })
  .strict();

const workoutShareBestSetSchema = z
  .object({
    exerciseName: z.string(),
    weightKg: finiteNumber,
    reps: finiteNumber,
    volumeKg: finiteNumber,
  })
  .strict();

export const workoutSharePayloadSchema = z
  .object({
    version: z.literal(1),
    workoutName: z.string().nullable(),
    dateISO: z.string(),
    durationMinutes: finiteNumber.nullable(),
    isPartial: z.boolean(),
    completedSetCount: finiteNumber,
    plannedSetCount: finiteNumber,
    totalReps: finiteNumber,
    totalVolumeKg: finiteNumber,
    bestSet: workoutShareBestSetSchema.nullable(),
    primaryMuscleGroups: z.array(z.string()),
    exercises: z.array(workoutShareExerciseSchema),
    coachSummary: z.string().nullable(),
    coachFull: z.array(z.string()).nullable(),
    caption: z.string().nullable(),
    locationLabel: z.string().nullable(),
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
