/**
 * Loads everything needed for the personal exercise dashboard:
 * performed sets (with their session timestamps) and the routines that
 * include the exercise. Read-only, RLS-scoped to the signed-in user.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeExerciseStats, type ExerciseStats, type StatSet } from "@/lib/exercise-stats";

export interface ExerciseIntel {
  stats: ExerciseStats;
  routines: string[];
}

async function fetchIntel(exerciseId: string): Promise<ExerciseIntel> {
  const [setsRes, tmplRes] = await Promise.all([
    supabase
      .from("workout_sets")
      .select(
        "reps, weight_kg, completed_at, actual_rest_seconds, session_id, workout_sessions(started_at, status)",
      )
      .eq("exercise_id", exerciseId),
    supabase
      .from("workout_template_exercises")
      .select("template_id, workout_templates(name)")
      .eq("exercise_id", exerciseId),
  ]);

  if (setsRes.error) throw setsRes.error;
  if (tmplRes.error) throw tmplRes.error;

  const sets: StatSet[] = (setsRes.data ?? []).map((row) => {
    const session = (row as { workout_sessions?: { started_at?: string | null } | null })
      .workout_sessions;
    return {
      reps: row.reps,
      weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
      completed_at: row.completed_at,
      actual_rest_seconds: row.actual_rest_seconds,
      session_id: row.session_id,
      session_at: session?.started_at ?? null,
    };
  });

  const routines = [
    ...new Set(
      (tmplRes.data ?? [])
        .map(
          (row) =>
            (row as { workout_templates?: { name?: string | null } | null }).workout_templates
              ?.name ?? "",
        )
        .filter((n) => n.trim().length > 0),
    ),
  ];

  return { stats: computeExerciseStats(sets), routines };
}

export function useExerciseIntel(exerciseId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["exercise-intel", exerciseId],
    queryFn: () => fetchIntel(exerciseId!),
    enabled: !!exerciseId && enabled,
    staleTime: 60_000,
  });
}
