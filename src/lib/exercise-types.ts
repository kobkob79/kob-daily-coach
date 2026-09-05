/**
 * Exercise "type" controls which fields the workout screen shows for a set —
 * weight/reps, or a time-based field set. Deliberately derived from the
 * existing `muscle_group`/`equipment` columns (already reliable, already
 * used for the treadmill/cardio case) rather than a new column on
 * `exercises`, so this needs no backfill and carries no migration risk of
 * its own.
 */

/** The sprint's seven exercise types, mapped down to how they're logged. */
export type ExerciseFieldSet = "strength" | "cardio" | "core" | "stretch";

/**
 * cardio: machine/continuous work (treadmill, bike, walking, HIIT/conditioning
 *   intervals) — logged once, by time (+ optional distance/speed/incline/HR).
 * core: held or timed core work (planks, holds) — still multiple discrete
 *   sets, each logged by time instead of reps.
 * stretch: mobility/stretching — time + which side + pain reported.
 * strength: everything else, including bodyweight reps — weight/reps as before.
 */
export function fieldSetForExercise(
  muscleGroup: string | null | undefined,
  _equipment?: string | null,
): ExerciseFieldSet {
  const mg = (muscleGroup ?? "").toLowerCase().trim();
  if (mg === "cardio" || mg === "conditioning") return "cardio";
  if (mg === "mobility") return "stretch";
  if (mg === "core") return "core";
  return "strength";
}

export const FIELD_SET_LABEL: Record<ExerciseFieldSet, string> = {
  strength: "כוח",
  cardio: "קרדיו",
  core: "ליבה",
  stretch: "מתיחה",
};
