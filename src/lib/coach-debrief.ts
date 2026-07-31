/**
 * Builds the compact context the Coach Debrief server function consumes.
 * Pure reads from Supabase via the existing workout-session helpers.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getPriorPRs,
  getSession,
  getSessionSets,
  getWeeklyPlan,
  listSessions,
  type SessionSet,
} from "@/lib/workout-session";
import type { CoachDebriefContext, DebriefExercise } from "@/lib/coach-debrief.functions";

function avg(nums: number[]): number | null {
  const clean = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (!clean.length) return null;
  return Math.round(clean.reduce((a, b) => a + b, 0) / clean.length);
}

export async function buildDebriefContext(
  sessionId: string,
  displayName: string,
): Promise<CoachDebriefContext> {
  const [session, sets, recent, plan] = await Promise.all([
    getSession(sessionId),
    getSessionSets(sessionId),
    listSessions(20),
    getWeeklyPlan().catch(() => []),
  ]);

  const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
  const [namesRes, priorPRs] = await Promise.all([
    exerciseIds.length
      ? supabase.from("exercises").select("id,name").in("id", exerciseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    getPriorPRs(exerciseIds, sessionId),
  ]);
  const names = new Map<string, string>();
  for (const row of (namesRes.data ?? []) as { id: string; name: string }[]) {
    names.set(row.id, row.name);
  }

  const byExercise = new Map<string, SessionSet[]>();
  for (const s of sets) {
    const arr = byExercise.get(s.exercise_id) ?? [];
    arr.push(s);
    byExercise.set(s.exercise_id, arr);
  }

  const exercises: DebriefExercise[] = [];
  for (const [id, rows] of byExercise) {
    const ordered = [...rows].sort((a, b) => a.set_number - b.set_number);
    const done = ordered.filter((s) => s.completed_at);
    const topWeight = done.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), 0);
    const topSet = done.find((s) => (s.weight_kg ?? 0) === topWeight) ?? done[0];
    const volume = done.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
    const doneReps = done.map((s) => s.reps ?? 0);
    const prev = priorPRs[id] ?? 0;
    exercises.push({
      name: names.get(id) ?? "תרגיל",
      plannedSets: ordered.length,
      completedSets: done.length,
      topWeightKg: topWeight || null,
      topReps: topSet?.reps ?? null,
      volumeKg: Math.round(volume),
      isPR: topWeight > 0 && topWeight > prev,
      prevBestKg: prev || null,
      avgRestSeconds: avg(done.map((s) => s.actual_rest_seconds ?? 0)),
      plannedRestSeconds: avg(ordered.map((s) => s.planned_rest_seconds ?? 0)),
      repsDropped:
        doneReps.length >= 2 && doneReps[doneReps.length - 1] < doneReps[0] - 1,
    });
  }

  const completedSets = sets.filter((s) => s.completed_at).length;
  const totalVolume = Math.round(
    sets.reduce((a, s) => a + (s.completed_at ? (s.weight_kg ?? 0) * (s.reps ?? 0) : 0), 0),
  );

  const others = recent.filter((s) => s.id !== sessionId && s.status === "completed");
  const prevSession = others[0] ?? null;
  const startedMs = session?.started_at ? new Date(session.started_at).getTime() : Date.now();
  const finishedMs = session?.finished_at
    ? new Date(session.finished_at).getTime()
    : Date.now();
  const daysSinceLastWorkout = prevSession?.finished_at
    ? Math.max(
        0,
        Math.floor((startedMs - new Date(prevSession.finished_at).getTime()) / 86400000),
      )
    : null;

  const todayWeekday = new Date().getDay();
  let nextWorkoutName: string | null = null;
  for (let i = 1; i <= 7; i++) {
    const slot = plan.find((p) => p.weekday === (todayWeekday + i) % 7);
    if (slot?.template_id || (slot?.display_name && slot.display_name !== "מנוחה")) {
      nextWorkoutName = slot?.display_name ?? null;
      break;
    }
  }

  return {
    now: new Date().toISOString(),
    displayName,
    workoutName: session?.name ?? null,
    durationMinutes: Math.max(
      1,
      session?.duration_seconds
        ? Math.round(session.duration_seconds / 60)
        : Math.round((finishedMs - startedMs) / 60000),
    ),
    totalVolumeKg: totalVolume,
    prevVolumeKg: prevSession?.total_volume_kg ?? null,
    plannedSets: sets.length,
    completedSets,
    skippedSets: Math.max(0, sets.length - completedSets),
    difficulty: session?.difficulty ?? null,
    energy: session?.energy ?? null,
    pain: session?.pain ?? null,
    notes: session?.notes ?? null,
    daysSinceLastWorkout,
    exercises,
    nextWorkoutName,
  };
}
