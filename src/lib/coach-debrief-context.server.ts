/**
 * Server-side, verified Coach Debrief context builder (Codex re-review
 * round 2, blocker 3, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * generateCoachDebrief used to accept a fully client-built CoachDebriefContext
 * and trust it wholesale — nothing stopped a request from sending fabricated
 * metrics/notes/exercises before the AI call, and that fabricated context
 * would then be persisted (workout_debriefs) and, from there, surfaced in a
 * public Community share under Viora's own byline. This module rebuilds the
 * exact same context shape entirely from `sessionId` + the caller's verified
 * identity (`context.userId`), reading only server-side queries explicitly
 * scoped to that user — the client can no longer influence a single field of
 * what the AI sees.
 *
 * Deliberately mirrors the math (see e1rm/avg/countSince below) of the
 * now-deleted client-side coach-debrief.ts's buildDebriefContext() field
 * for field, rather than reusing its queries directly: those (getSession/
 * getSessionSets/listSessions/getPriorPRs/getWeeklyPlan, all in
 * workout-session.ts) are hardwired to the browser's global `supabase`
 * singleton, which has no user session on the server. Rewiring
 * workout-session.ts's ~10 exported functions to accept an injectable
 * client would be a repo-wide refactor touching every screen that uses
 * them — out of scope for this fix; duplicating the handful of simple
 * SELECT queries this context actually needs, parameterized by the
 * request-scoped client, keeps the fix contained to the Community Share
 * Studio area.
 *
 * Relative imports (not "@/...") so this file's colocated node --test suite
 * can import it directly — see community-workout-share.server.ts for the
 * same convention and the reason (Node's ESM loader doesn't resolve Vite's
 * "@/" alias).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logDebriefSafeFailure } from "./coach-debrief-safety.ts";
import type { CoachDebriefContext, DebriefExercise } from "./coach-debrief.functions.ts";

// workout_sessions/workout_sets/workout_plans/exercises are not yet
// re-emitted into src/integrations/supabase/types.ts — cast through `any`
// for these tables only, matching the established convention in
// community-workout-share.server.ts and workout-session.ts itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface DebriefSessionRow {
  id: string;
  user_id: string;
  name: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  total_volume_kg: number | null;
  difficulty: number | null;
  energy: number | null;
  pain: string | null;
  notes: string | null;
}

interface DebriefSetRow {
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  completed_at: string | null;
  actual_rest_seconds: number | null;
  planned_rest_seconds: number | null;
}

interface RecentSessionRow {
  id: string;
  status: string;
  finished_at: string | null;
  total_volume_kg: number | null;
}

interface PlanSlotRow {
  weekday: number;
  template_id: string | null;
  display_name: string | null;
}

/** Epley estimate, rounded to 0.5 kg — same formula as coach-debrief.ts's e1rm. */
function e1rm(weightKg: number, reps: number | null): number | null {
  if (!weightKg || !reps || reps <= 0) return null;
  return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}

function avg(nums: number[]): number | null {
  const clean = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (!clean.length) return null;
  return Math.round(clean.reduce((a, b) => a + b, 0) / clean.length);
}

/** Completed sessions finished within the last `days` days. */
function countSince(sessions: { finished_at: string | null }[], days: number): number {
  const cutoff = Date.now() - days * 86400000;
  return sessions.filter((s) => s.finished_at && new Date(s.finished_at).getTime() >= cutoff)
    .length;
}

async function loadSession(
  client: AnyClient,
  userId: string,
  sessionId: string,
): Promise<DebriefSessionRow | null> {
  const { data, error } = await client
    .from("workout_sessions")
    .select(
      "id,user_id,name,status,started_at,finished_at,duration_seconds,total_volume_kg,difficulty,energy,pain,notes",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DebriefSessionRow) ?? null;
}

async function loadSets(
  client: AnyClient,
  userId: string,
  sessionId: string,
): Promise<DebriefSetRow[]> {
  const { data, error } = await client
    .from("workout_sets")
    .select(
      "exercise_id,set_number,weight_kg,reps,completed_at,actual_rest_seconds,planned_rest_seconds",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DebriefSetRow[];
}

async function loadExerciseNames(
  client: AnyClient,
  exerciseIds: string[],
): Promise<Map<string, string>> {
  if (exerciseIds.length === 0) return new Map();
  const { data, error } = await client.from("exercises").select("id,name").in("id", exerciseIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    map.set(row.id, row.name);
  }
  return map;
}

/** Best weight per exercise from the caller's own completed sets in OTHER sessions — mirrors workout-session.ts's getPriorPRs, scoped server-side by userId instead of the browser client's own JWT. */
async function loadPriorPRs(
  client: AnyClient,
  userId: string,
  exerciseIds: string[],
  excludeSessionId: string,
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await client
    .from("workout_sets")
    .select("exercise_id,weight_kg")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .not("completed_at", "is", null)
    .neq("session_id", excludeSessionId);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { exercise_id: string; weight_kg: number | null }[]) {
    map[row.exercise_id] = Math.max(map[row.exercise_id] ?? 0, row.weight_kg ?? 0);
  }
  return map;
}

/** Mirrors workout-session.ts's listSessions, scoped server-side by userId. */
async function loadRecentSessions(
  client: AnyClient,
  userId: string,
  limit: number,
): Promise<RecentSessionRow[]> {
  const { data, error } = await client
    .from("workout_sessions")
    .select("id,status,finished_at,total_volume_kg")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RecentSessionRow[];
}

/** Mirrors workout-session.ts's getWeeklyPlan, scoped server-side by userId. */
async function loadWeeklyPlan(client: AnyClient, userId: string): Promise<PlanSlotRow[]> {
  const { data, error } = await client
    .from("workout_plans")
    .select("weekday,template_id,display_name")
    .eq("user_id", userId)
    .order("weekday");
  if (error) throw error;
  return (data ?? []) as PlanSlotRow[];
}

async function loadDisplayName(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client
    .from("profiles")
    .select("first_name")
    .eq("id", userId)
    .maybeSingle();
  return (data as { first_name: string | null } | null)?.first_name?.trim() || "";
}

async function buildVerifiedDebriefContextUnsafe(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<CoachDebriefContext | null> {
  const anyClient = client as AnyClient;
  const session = await loadSession(anyClient, userId, sessionId);
  if (!session) return null;

  const [sets, recent, plan, displayName] = await Promise.all([
    loadSets(anyClient, userId, sessionId),
    loadRecentSessions(anyClient, userId, 20),
    loadWeeklyPlan(anyClient, userId).catch(() => [] as PlanSlotRow[]),
    loadDisplayName(client, userId),
  ]);

  const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
  const [names, priorPRs] = await Promise.all([
    loadExerciseNames(anyClient, exerciseIds),
    loadPriorPRs(anyClient, userId, exerciseIds, sessionId),
  ]);

  const byExercise = new Map<string, DebriefSetRow[]>();
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
      repsDropped: doneReps.length >= 2 && doneReps[doneReps.length - 1] < doneReps[0] - 1,
      e1rmKg: e1rm(topWeight, topSet?.reps ?? null),
      prevE1rmKg: prev ? Math.round(prev * 1.03) : null,
      weightDeltaKg: topWeight > 0 && prev > 0 ? Math.round((topWeight - prev) * 10) / 10 : null,
    });
  }

  const completedSets = sets.filter((s) => s.completed_at).length;
  const totalVolume = Math.round(
    sets.reduce((a, s) => a + (s.completed_at ? (s.weight_kg ?? 0) * (s.reps ?? 0) : 0), 0),
  );

  const others = recent.filter((s) => s.id !== sessionId && s.status === "completed");
  const prevSession = others[0] ?? null;
  const startedMs = session.started_at ? new Date(session.started_at).getTime() : Date.now();
  const finishedMs = session.finished_at ? new Date(session.finished_at).getTime() : Date.now();
  const daysSinceLastWorkout = prevSession?.finished_at
    ? Math.max(0, Math.floor((startedMs - new Date(prevSession.finished_at).getTime()) / 86400000))
    : null;

  const recentVolumes = others
    .slice(0, 4)
    .map((s) => s.total_volume_kg ?? 0)
    .filter((v) => v > 0);
  const avgVolume = recentVolumes.length
    ? Math.round(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length)
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
    workoutName: session.name ?? null,
    durationMinutes: Math.max(
      1,
      session.duration_seconds
        ? Math.round(session.duration_seconds / 60)
        : Math.round((finishedMs - startedMs) / 60000),
    ),
    totalVolumeKg: totalVolume,
    prevVolumeKg: prevSession?.total_volume_kg ?? null,
    workoutsLast7Days: countSince(others, 7),
    workoutsLast30Days: countSince(others, 30),
    avgVolumeLast4WorkoutsKg: avgVolume,
    volumeTrendPct:
      avgVolume && avgVolume > 0 ? Math.round(((totalVolume - avgVolume) / avgVolume) * 100) : null,
    completionRatePct: sets.length ? Math.round((completedSets / sets.length) * 100) : 0,
    plannedSets: sets.length,
    completedSets,
    skippedSets: Math.max(0, sets.length - completedSets),
    difficulty: session.difficulty ?? null,
    energy: session.energy ?? null,
    pain: session.pain ?? null,
    notes: session.notes ?? null,
    daysSinceLastWorkout,
    exercises,
    nextWorkoutName,
  };
}

/**
 * Returns null when the session doesn't exist or doesn't belong to
 * `userId` — the caller treats this the same as "session not found",
 * never a partial/best-effort context.
 *
 * Also returns null (Codex re-review round 3, F4) on a genuine DB/query
 * failure while building the context — a failed request here must never
 * leak a raw server/Postgrest error to the caller. Logged via
 * logDebriefSafeFailure (Codex re-review round 4, F1) — a fixed event
 * name and a fresh correlationId only, never the error itself, never
 * sessionId/userId, never debrief content or health data. Nothing here
 * is in scope to leak the raw error even if a future edit tried to.
 */
export async function buildVerifiedDebriefContext(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<CoachDebriefContext | null> {
  try {
    return await buildVerifiedDebriefContextUnsafe(client, userId, sessionId);
  } catch {
    logDebriefSafeFailure("coach_debrief_context_failed");
    return null;
  }
}
