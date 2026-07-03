/**
 * Canonical Hebrew muscle groups for the exercise library.
 * Every exercise is bucketed into one of these groups via its
 * `muscle_group` text column.
 */
export const MUSCLE_GROUPS = [
  "חזה",
  "גב",
  "רגליים",
  "כתפיים",
  "יד קדמית",
  "יד אחורית",
  "בטן",
  "שרירי ליבה",
  "קרדיו",
  "מוביליטי",
  "אחר",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export function normalizeMuscleGroup(raw: string | null | undefined): MuscleGroup {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "אחר";
  if ((MUSCLE_GROUPS as readonly string[]).includes(raw as string)) return raw as MuscleGroup;
  if (/chest|חזה/.test(s)) return "חזה";
  if (/back|posterior|lat|גב/.test(s)) return "גב";
  if (/quad|hamstring|glute|calv|leg|hip|רגל/.test(s)) return "רגליים";
  if (/shoulder|delt|כתף/.test(s)) return "כתפיים";
  if (/bicep|קדמית/.test(s)) return "יד קדמית";
  if (/tricep|אחורית/.test(s)) return "יד אחורית";
  if (/abs|בטן/.test(s)) return "בטן";
  if (/core|spine|neck|ליבה|צוואר/.test(s)) return "שרירי ליבה";
  if (/cardio|קרדיו/.test(s)) return "קרדיו";
  if (/mobility|stretch|מוביל/.test(s)) return "מוביליטי";
  return "אחר";
}
