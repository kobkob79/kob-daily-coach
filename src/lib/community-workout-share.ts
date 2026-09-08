/**
 * Community Share Studio — Workout Result payload (Phase 1,
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Pure module: no Supabase/React import, so the whole metrics story is
 * unit-testable without a live session and safely importable from both the
 * server-side publish function and client-side preview code (the preview
 * must show literally the same payload that gets published — this module
 * is the single source of truth for both).
 *
 * Warm-up semantics (matching the existing, documented convention on
 * `SessionSet.is_warmup` in workout-session.ts and already applied by
 * exercise-stats.ts/getExercisePRStats/next-load-suggestion.ts):
 *   - Session-level totals (completed-set count, total reps, total volume)
 *     INCLUDE warm-up sets — same as the existing total-volume convention
 *     used in workout-export.ts and finalizeSession, so this card's totals
 *     always match what the athlete already sees elsewhere for the same
 *     session.
 *   - The best-set, the exercise breakdown, and primary muscle groups
 *     EXCLUDE warm-up sets — same convention as PR detection
 *     (workout-session.ts detectPRs/getExercisePRStats, both
 *     `.eq("is_warmup", false)`) and per-exercise stats
 *     (exercise-stats.ts `allSets.filter((s) => !s.is_warmup)`). A warm-up
 *     set was never meant to represent "what I actually lifted."
 */

export interface WorkoutShareSourceSession {
  name: string | null;
  started_at: string;
  duration_seconds: number | null;
}

export interface WorkoutShareSourceSet {
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  is_warmup: boolean;
  completed_at: string | null;
}

export interface WorkoutShareExerciseInfo {
  name: string;
  muscle_group: string | null;
}

/** Only the AI-generated narrative text — never the raw CoachDebriefContext (which carries pain/notes/health fields) and never an error/category/correlationId. */
export interface WorkoutShareCoachInput {
  greeting: string;
  paragraphs: string[];
  highlights: string[];
}

export interface WorkoutShareExerciseSet {
  weightKg: number | null;
  reps: number | null;
}

export interface WorkoutShareExercise {
  name: string;
  sets: WorkoutShareExerciseSet[];
}

export interface WorkoutShareBestSet {
  exerciseName: string;
  weightKg: number;
  reps: number;
  volumeKg: number;
}

export interface WorkoutSharePayloadV1 {
  version: 1;
  workoutName: string | null;
  dateISO: string;
  durationMinutes: number | null;
  isPartial: boolean;
  completedSetCount: number;
  plannedSetCount: number;
  totalReps: number;
  totalVolumeKg: number;
  bestSet: WorkoutShareBestSet | null;
  primaryMuscleGroups: string[];
  exercises: WorkoutShareExercise[];
  coachSummary: string | null;
  coachFull: string[] | null;
  caption: string | null;
  locationLabel: string | null;
}

export type WorkoutSharePayload = WorkoutSharePayloadV1;

export const WORKOUT_SHARE_CAPTION_MAX_LENGTH = 500;
/** Paragraphs beyond this count are dropped, and each paragraph is capped — a caption-length sanity bound on AI-generated text, not a rewrite of it. */
const COACH_MAX_PARAGRAPHS = 6;
const COACH_MAX_PARAGRAPH_LENGTH = 600;

function sanitizeCoachLine(line: string): string {
  // Strips control/formatting characters a raw provider string could carry
  // (newline collapsing, no HTML) — this is display sanitization, not a
  // truthfulness check; the text itself is Viora's own already-generated,
  // already-user-visible Hebrew commentary, never re-verified here.
  return line
    .replace(/[\x00-\x1F\x7F]/g, " ") // eslint-disable-line no-control-regex -- intentional strip, not accidental
    .trim()
    .slice(0, COACH_MAX_PARAGRAPH_LENGTH);
}

export interface BuildWorkoutSharePayloadInput {
  session: WorkoutShareSourceSession;
  /** Must already be ordered by position (exercise/set order), as getSessionSets returns. */
  sets: WorkoutShareSourceSet[];
  exercisesById: Map<string, WorkoutShareExerciseInfo>;
  /** Personal caption, already trimmed/length-capped by the caller's own UI copy — re-capped here regardless, never trusted for length alone. */
  caption: string | null;
  /** Human-readable location only — never coordinates. Null unless the author explicitly opted in for this post. */
  locationLabel: string | null;
  /** Null when the coach section is disabled or the debrief was unavailable — sharing must not depend on this. */
  coach: WorkoutShareCoachInput | null;
}

/**
 * Deterministic, pure builder — same input always produces the same
 * payload. Never invents a value: every field is either a real aggregate
 * over the given sets or null.
 */
export function buildWorkoutSharePayload(
  input: BuildWorkoutSharePayloadInput,
): WorkoutSharePayloadV1 {
  const { session, sets, exercisesById, caption, locationLabel, coach } = input;

  const plannedSetCount = sets.length;
  const completedSets = sets.filter((s) => s.completed_at != null);
  const completedSetCount = completedSets.length;
  const isPartial = completedSetCount < plannedSetCount;

  let totalReps = 0;
  let totalVolumeKg = 0;
  for (const s of completedSets) {
    const reps = s.reps ?? 0;
    const weightKg = s.weight_kg ?? 0;
    totalReps += reps;
    totalVolumeKg += weightKg * reps;
  }
  totalVolumeKg = Math.round(totalVolumeKg);

  const workingCompletedSets = completedSets.filter((s) => !s.is_warmup);

  let bestSet: WorkoutShareBestSet | null = null;
  let bestVolume = -Infinity;
  for (const s of workingCompletedSets) {
    if (s.weight_kg == null || s.reps == null) continue;
    const volumeKg = s.weight_kg * s.reps;
    if (volumeKg > bestVolume) {
      bestVolume = volumeKg;
      bestSet = {
        exerciseName: exercisesById.get(s.exercise_id)?.name ?? "תרגיל",
        weightKg: s.weight_kg,
        reps: s.reps,
        volumeKg: Math.round(volumeKg),
      };
    }
  }

  // Group by exercise, preserving first-appearance order (sets are
  // position-ordered) — only exercises with at least one completed,
  // non-warm-up set are included, per "empty planned exercises must not
  // appear in the breakdown."
  const exerciseOrder: string[] = [];
  const byExercise = new Map<string, WorkoutShareSourceSet[]>();
  for (const s of workingCompletedSets) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, []);
      exerciseOrder.push(s.exercise_id);
    }
    byExercise.get(s.exercise_id)!.push(s);
  }

  const exercises: WorkoutShareExercise[] = exerciseOrder.map((exId) => ({
    name: exercisesById.get(exId)?.name ?? "תרגיל",
    sets: (byExercise.get(exId) ?? []).map((s) => ({ weightKg: s.weight_kg, reps: s.reps })),
  }));

  const primaryMuscleGroups: string[] = [];
  const seenMuscleGroups = new Set<string>();
  for (const exId of exerciseOrder) {
    const group = exercisesById.get(exId)?.muscle_group;
    if (group && !seenMuscleGroups.has(group)) {
      seenMuscleGroups.add(group);
      primaryMuscleGroups.push(group);
    }
  }

  let coachSummary: string | null = null;
  let coachFull: string[] | null = null;
  if (coach) {
    const paragraphs = coach.paragraphs
      .map(sanitizeCoachLine)
      .filter(Boolean)
      .slice(0, COACH_MAX_PARAGRAPHS);
    const greeting = sanitizeCoachLine(coach.greeting);
    coachFull = greeting ? [greeting, ...paragraphs] : paragraphs;
    if (coachFull.length === 0) coachFull = null;
    coachSummary = coachFull ? coachFull.slice(0, 2).join(" ") : null;
  }

  const trimmedCaption = caption?.trim().slice(0, WORKOUT_SHARE_CAPTION_MAX_LENGTH) || null;
  const trimmedLocation = locationLabel?.trim().slice(0, 120) || null;

  return {
    version: 1,
    workoutName: session.name?.trim() || null,
    dateISO: session.started_at,
    durationMinutes:
      session.duration_seconds != null ? Math.round(session.duration_seconds / 60) : null,
    isPartial,
    completedSetCount,
    plannedSetCount,
    totalReps,
    totalVolumeKg,
    bestSet,
    primaryMuscleGroups,
    exercises,
    coachSummary,
    coachFull,
    caption: trimmedCaption,
    locationLabel: trimmedLocation,
  };
}

/** "3 מתוך 31 סטים הושלמו" / "31 מתוך 31 סטים הושלמו" — never a misleading "completed/completed" fraction. */
export function formatSetCompletionLabel(payload: WorkoutSharePayload): string {
  return `${payload.completedSetCount} מתוך ${payload.plannedSetCount} סטים הושלמו`;
}

function formatSetLine(s: WorkoutShareExerciseSet): string {
  const w = s.weightKg;
  const r = s.reps;
  if (w != null && w > 0 && r != null) return `${w} ק״ג × ${r}`;
  if (w != null && w > 0) return `${w} ק״ג`;
  if (r != null) return `${r} חזרות`;
  return "—";
}

/** "30 ק״ג × 12 · 40 ק״ג × 12 · 50 ק״ג × 12" — the exact breakdown line format from the spec. */
export function formatExerciseSetLine(exercise: WorkoutShareExercise): string {
  return exercise.sets.map(formatSetLine).join(" · ");
}
