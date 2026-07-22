/**
 * Workout Session helpers — Sprint 1.
 *
 * The tables added in this sprint (workout_plans, workout_sessions, plus new
 * columns on workout_sets) haven't been re-emitted into
 * `src/integrations/supabase/types.ts` yet, so this module isolates the
 * `as any` casts needed to talk to those tables. Every call is still scoped
 * to the signed-in `user_id` and relies on RLS for safety.
 */
import { supabase } from "@/integrations/supabase/client";

export type SessionStatus = "in_progress" | "completed" | "discarded" | "abandoned" | "cancelled";
export type PainLevel = "none" | "mild" | "significant";

export interface SessionRow {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string | null;
  status: SessionStatus;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  total_volume_kg: number | null;
  difficulty: number | null;
  energy: number | null;
  pain: PainLevel | null;
  notes: string | null;
  edited_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionHealth {
  session: SessionRow | null;
  sets: SessionSet[];
  restorable: boolean;
  repairable: boolean;
  stale: boolean;
  reason: string | null;
  completedSetCount: number;
  lastCompletedSetAt: string | null;
  templateExerciseCount: number;
  missingExerciseCount: number;
}

export class SessionRestoreError extends Error {
  health: SessionHealth;
  constructor(message: string, health: SessionHealth) {
    super(message);
    this.health = health;
  }
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const RECENT_ACTIVITY_MS = 60 * 60 * 1000;

export interface SessionSet {
  id: string;
  session_id: string | null;
  exercise_id: string;
  user_id: string;
  set_number: number;
  position: number | null;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  completed_at: string | null;
  planned_rest_seconds: number | null;
  actual_rest_seconds: number | null;
  overtime_seconds: number | null;
  notes: string | null;
  created_at: string;
}

export interface PlanSlot {
  id: string;
  weekday: number;
  template_id: string | null;
  display_name: string | null;
}

export const WEEKDAY_HE = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
] as const;

/* --------------------------- Plans --------------------------- */

export async function getWeeklyPlan(): Promise<PlanSlot[]> {
  const { data, error } = await (supabase as any)
    .from("workout_plans")
    .select("id,weekday,template_id,display_name")
    .order("weekday");
  if (error) throw error;
  return (data ?? []) as PlanSlot[];
}

export async function setPlanSlot(
  weekday: number,
  templateId: string | null,
  displayName: string | null,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { error } = await (supabase as any)
    .from("workout_plans")
    .upsert(
      {
        user_id: u.user.id,
        weekday,
        template_id: templateId,
        display_name: displayName,
      },
      { onConflict: "user_id,weekday" },
    );
  if (error) throw error;
}

/* --------------------------- Sessions --------------------------- */

export async function createSessionFromTemplate(
  templateId: string,
  templateName: string,
): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data, error } = await (supabase as any)
    .from("workout_sessions")
    .insert({
      user_id: u.user.id,
      template_id: templateId,
      name: templateName,
      status: "in_progress",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Returns the current signed-in user's single active (in_progress) session, if any. */
export async function getActiveSession(): Promise<SessionRow | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await (supabase as any)
    .from("workout_sessions")
    .select("*")
    .eq("user_id", u.user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as SessionRow) ?? null;
}

export class ActiveSessionConflictError extends Error {
  active: SessionRow;
  constructor(active: SessionRow) {
    super("ACTIVE_SESSION_CONFLICT");
    this.active = active;
  }
}

/**
 * Start a session for the given template, resume it if one already exists
 * for the same template, or throw ActiveSessionConflictError if a *different*
 * template already has an active session. Seeds planned sets on first create.
 */
export async function startOrResumeSessionForTemplate(
  templateId: string,
  templateName: string,
): Promise<{ sessionId: string; resumed: boolean }> {
  await assertTemplateHasExercises(templateId);
  const active = await getActiveSession();
  if (active) {
    if (active.template_id === templateId) {
      return { sessionId: active.id, resumed: true };
    }
    throw new ActiveSessionConflictError(active);
  }
  let sessionId: string;
  try {
    sessionId = await createSessionFromTemplate(templateId, templateName);
  } catch (error: any) {
    if (error?.code === "23505") {
      const current = await getActiveSession();
      if (current?.template_id === templateId) return { sessionId: current.id, resumed: true };
      if (current) throw new ActiveSessionConflictError(current);
    }
    throw error;
  }
  try {
    await seedSessionFromTemplate(sessionId, templateId);
    const health = await getSessionHealth(sessionId);
    if (!health.restorable) throw new SessionRestoreError(health.reason ?? "SESSION_NOT_RESTORABLE", health);
  } catch (e) {
    // Roll back the empty session so the user isn't stuck with a dud.
    await discardSession(sessionId).catch(() => {});
    throw e;
  }
  return { sessionId, resumed: false };
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const { data, error } = await (supabase as any)
    .from("workout_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as SessionRow) ?? null;
}

export async function getSessionSets(sessionId: string): Promise<SessionSet[]> {
  const { data, error } = await (supabase as any)
    .from("workout_sets")
    .select("*")
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SessionSet[];
}

export async function listSessions(limit = 50): Promise<SessionRow[]> {
  const { data, error } = await (supabase as any)
    .from("workout_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SessionRow[];
}

export async function updateSession(
  id: string,
  patch: Partial<SessionRow>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("workout_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function touchSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return;
  const { error } = await (supabase as any)
    .from("workout_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "in_progress");
  if (error) console.warn("[workout-session] failed to touch session", error);
}

export async function finalizeSession(
  id: string,
  feedback: {
    difficulty: number;
    energy: number;
    pain: PainLevel;
    notes?: string | null;
  },
): Promise<void> {
  const started = (await getSession(id))?.started_at;
  const startedMs = started ? new Date(started).getTime() : Date.now();
  const durationSec = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
  const sets = await getSessionSets(id);
  const volume = sets.reduce(
    (acc, s) => acc + (s.completed_at ? (s.weight_kg ?? 0) * (s.reps ?? 0) : 0),
    0,
  );
  await updateSession(id, {
    status: "completed",
    finished_at: new Date().toISOString(),
    duration_seconds: durationSec,
    total_volume_kg: Math.round(volume),
    difficulty: feedback.difficulty,
    energy: feedback.energy,
    pain: feedback.pain,
    notes: feedback.notes ?? null,
  });
}

export async function discardSession(id: string): Promise<void> {
  await updateSession(id, {
    status: "discarded",
    finished_at: new Date().toISOString(),
  });
}

/* --------------------------- Sets --------------------------- */

export async function insertPlannedSet(input: {
  sessionId: string;
  exerciseId: string;
  position: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  plannedRestSec: number | null;
}): Promise<SessionSet> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data, error } = await (supabase as any)
    .from("workout_sets")
    .insert({
      session_id: input.sessionId,
      user_id: u.user.id,
      exercise_id: input.exerciseId,
      set_number: input.setNumber,
      position: input.position,
      weight_kg: input.weightKg,
      reps: input.reps,
      planned_rest_seconds: input.plannedRestSec,
    })
    .select("*")
    .single();
  if (error) throw error;
  await touchSession(input.sessionId);
  return data as SessionSet;
}

export async function updateSet(id: string, patch: Partial<SessionSet>): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("workout_sets")
    .update(patch)
    .eq("id", id)
    .select("session_id")
    .maybeSingle();
  if (error) throw error;
  await touchSession((data as { session_id: string | null } | null)?.session_id);
}

export async function deleteSet(id: string): Promise<void> {
  const { data: existing } = await (supabase as any)
    .from("workout_sets")
    .select("session_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await (supabase as any)
    .from("workout_sets")
    .delete()
    .eq("id", id);
  if (error) throw error;
  await touchSession((existing as { session_id: string | null } | null)?.session_id);
}

async function assertTemplateHasExercises(templateId: string): Promise<void> {
  const { count, error } = await (supabase as any)
    .from("workout_template_exercises")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  if (error) throw error;
  if (!count) throw new Error("NO_TEMPLATE_EXERCISES");
}

function computeStale(session: SessionRow, completedSets: SessionSet[]): boolean {
  const startedMs = new Date(session.started_at).getTime();
  const updatedMs = session.updated_at ? new Date(session.updated_at).getTime() : startedMs;
  const lastCompletedMs = Math.max(
    0,
    ...completedSets.map((s) => s.completed_at ? new Date(s.completed_at).getTime() : 0),
  );
  const now = Date.now();
  return now - startedMs > STALE_AFTER_MS &&
    now - updatedMs > RECENT_ACTIVITY_MS &&
    (!lastCompletedMs || now - lastCompletedMs > RECENT_ACTIVITY_MS);
}

export async function getSessionHealth(sessionId: string): Promise<SessionHealth> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return {
      session: null,
      sets: [],
      restorable: false,
      repairable: false,
      stale: false,
      reason: "SIGNED_OUT",
      completedSetCount: 0,
      lastCompletedSetAt: null,
      templateExerciseCount: 0,
      missingExerciseCount: 0,
    };
  }

  const session = await getSession(sessionId);
  if (!session || session.user_id !== u.user.id) {
    return {
      session: null,
      sets: [],
      restorable: false,
      repairable: false,
      stale: false,
      reason: "SESSION_NOT_FOUND",
      completedSetCount: 0,
      lastCompletedSetAt: null,
      templateExerciseCount: 0,
      missingExerciseCount: 0,
    };
  }

  const sets = await getSessionSets(sessionId);
  const completed = sets.filter((s) => s.completed_at);
  const lastCompletedSetAt = completed
    .map((s) => s.completed_at!)
    .sort()
    .at(-1) ?? null;
  let templateExerciseCount = 0;
  let missingExerciseCount = 0;
  let repairable = false;
  let restorable = false;
  let reason: string | null = null;

  if (sets.length > 0) {
    const ids = Array.from(new Set(sets.map((s) => s.exercise_id)));
    const { data: exercises, error } = await supabase
      .from("exercises")
      .select("id")
      .in("id", ids);
    if (error) throw error;
    missingExerciseCount = ids.length - (exercises?.length ?? 0);
    restorable = missingExerciseCount === 0;
    reason = restorable ? null : "MISSING_EXERCISES";
  } else if (session.template_id) {
    const { data: rows, error } = await (supabase as any)
      .from("workout_template_exercises")
      .select("exercise_id, exercises!inner(id)")
      .eq("template_id", session.template_id);
    if (error) throw error;
    templateExerciseCount = rows?.length ?? 0;
    repairable = templateExerciseCount > 0;
    restorable = repairable;
    reason = repairable ? "SESSION_NEEDS_SEEDING" : "NO_TEMPLATE_EXERCISES";
  } else {
    reason = "NO_TEMPLATE_OR_SETS";
  }

  return {
    session,
    sets,
    restorable,
    repairable,
    stale: session.status === "in_progress" && computeStale(session, completed),
    reason,
    completedSetCount: completed.length,
    lastCompletedSetAt,
    templateExerciseCount,
    missingExerciseCount,
  };
}

export async function ensureSessionRestored(sessionId: string): Promise<SessionHealth> {
  let health = await getSessionHealth(sessionId);
  if (health.repairable && health.session?.template_id && health.sets.length === 0) {
    await seedSessionFromTemplate(sessionId, health.session.template_id);
    health = await getSessionHealth(sessionId);
  }
  if (!health.restorable || health.sets.length === 0) {
    throw new SessionRestoreError(health.reason ?? "SESSION_NOT_RESTORABLE", health);
  }
  return health;
}

/* --------------------------- Analytics --------------------------- */

export function computeVolume(sets: SessionSet[]): number {
  return sets.reduce(
    (acc, s) => acc + (s.completed_at ? (s.weight_kg ?? 0) * (s.reps ?? 0) : 0),
    0,
  );
}

/** For each exercise, returns whether the max weight this session > any prior. */
export async function detectPRs(
  userId: string,
  sessionId: string,
  sets: SessionSet[],
): Promise<Record<string, boolean>> {
  const byExercise = new Map<string, number>();
  for (const s of sets) {
    if (!s.completed_at) continue;
    const w = s.weight_kg ?? 0;
    if (w > (byExercise.get(s.exercise_id) ?? 0)) byExercise.set(s.exercise_id, w);
  }
  if (!byExercise.size) return {};
  const ids = Array.from(byExercise.keys());
  const { data } = await (supabase as any)
    .from("workout_sets")
    .select("exercise_id,weight_kg,session_id")
    .eq("user_id", userId)
    .in("exercise_id", ids)
    .not("completed_at", "is", null)
    .neq("session_id", sessionId);
  const prevMax = new Map<string, number>();
  for (const row of (data ?? []) as SessionSet[]) {
    prevMax.set(
      row.exercise_id,
      Math.max(prevMax.get(row.exercise_id) ?? 0, row.weight_kg ?? 0),
    );
  }
  const result: Record<string, boolean> = {};
  for (const [ex, cur] of byExercise) {
    result[ex] = cur > (prevMax.get(ex) ?? 0) && cur > 0;
  }
  return result;
}

/* --------------------------- Briefing (rule-based) --------------------------- */

export interface Briefing {
  todayLine: string;
  previousLine: string;
  tipLine: string;
}

export async function buildBriefing(
  templateName: string,
  templateId: string,
): Promise<Briefing> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { todayLine: `היום: ${templateName}`, previousLine: "אין נתונים משיעורים קודמים.", tipLine: "התחל בחימום קצר של 5 דקות." };
  const { data } = await (supabase as any)
    .from("workout_sessions")
    .select("total_volume_kg,pain,difficulty,finished_at")
    .eq("template_id", templateId)
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1);
  const last = (data ?? [])[0] as
    | { total_volume_kg: number | null; pain: PainLevel | null; difficulty: number | null }
    | undefined;

  const todayLine = `היום: ${templateName}`;
  let previousLine = "אימון ראשון מסוג זה — נמדוד ממנו והלאה.";
  if (last?.total_volume_kg) {
    previousLine = `בפעם הקודמת הרמת סה״כ ${Math.round(last.total_volume_kg)} ק״ג.`;
  }
  let tipLine = "התחל בחימום קצר ובנשימות עמוקות.";
  if (last?.pain && last.pain !== "none") {
    tipLine = "בפעם הקודמת דיווחת על כאב — הפחת משקל ב-10% והתמקד בטכניקה.";
  } else if (last?.difficulty && last.difficulty >= 4) {
    tipLine = "האימון הקודם היה קשה — שמור על אותם משקלים והתמקד בביצוע.";
  } else if (last) {
    tipLine = "נסה להוסיף 2.5 ק״ג בתרגיל המרכזי — עמדת יפה בפעם הקודמת.";
  }
  return { todayLine, previousLine, tipLine };
}

/* --------------------------- Seeding from history --------------------------- */

interface TemplateExerciseRow {
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
}

/**
 * Return the sets from the user's most recent *completed* session that
 * included this exercise. Sorted by set_number.
 */
export async function getLastPerformanceByExercise(
  exerciseId: string,
): Promise<SessionSet[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  // Find most recent completed session containing this exercise
  const { data: rows } = await (supabase as any)
    .from("workout_sets")
    .select("session_id, workout_sessions!inner(status, finished_at)")
    .eq("user_id", u.user.id)
    .eq("exercise_id", exerciseId)
    .eq("workout_sessions.status", "completed")
    .not("completed_at", "is", null)
    .order("workout_sessions(finished_at)", { ascending: false })
    .limit(1);
  const sessionId = (rows ?? [])[0]?.session_id as string | undefined;
  if (!sessionId) return [];
  const { data } = await (supabase as any)
    .from("workout_sets")
    .select("*")
    .eq("session_id", sessionId)
    .eq("exercise_id", exerciseId)
    .order("set_number", { ascending: true });
  return (data ?? []) as SessionSet[];
}

/**
 * PR = max weight ever lifted for this exercise (completed sets only).
 */
export async function getExercisePR(exerciseId: string): Promise<number> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;
  const { data } = await (supabase as any)
    .from("workout_sets")
    .select("weight_kg")
    .eq("user_id", u.user.id)
    .eq("exercise_id", exerciseId)
    .not("completed_at", "is", null)
    .order("weight_kg", { ascending: false })
    .limit(1);
  return (data?.[0]?.weight_kg as number | null) ?? 0;
}

/**
 * Seed a session with planned sets. For each template exercise, prefer the
 * user's last actual performance (weight/reps per set), else fall back to
 * template targets. Idempotent: if the session already has any sets, no-op.
 */
export async function seedSessionFromTemplate(
  sessionId: string,
  templateId: string,
): Promise<void> {
  const existing = await getSessionSets(sessionId);
  if (existing.length > 0) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data: rows } = await (supabase as any)
    .from("workout_template_exercises")
    .select("exercise_id, position, target_sets, target_reps, target_weight_kg")
    .eq("template_id", templateId)
    .order("position");
  const tplRows = (rows ?? []) as TemplateExerciseRow[];
  if (tplRows.length === 0) return;
  const DEFAULT_REST = 90;

  // Fetch prior performances in parallel (once per unique exercise).
  const uniqIds = Array.from(new Set(tplRows.map((r) => r.exercise_id)));
  const histories = await Promise.all(uniqIds.map((id) => getLastPerformanceByExercise(id)));
  const historyByEx = new Map(uniqIds.map((id, i) => [id, histories[i]]));

  // Build every planned row up-front and insert in a single batch call.
  const inserts: any[] = [];
  let pos = 0;
  for (const r of tplRows) {
    const history = historyByEx.get(r.exercise_id) ?? [];
    const targetSets = r.target_sets ?? 3;
    for (let n = 1; n <= targetSets; n++) {
      pos += 1;
      const past = history.find((h) => h.set_number === n);
      inserts.push({
        session_id: sessionId,
        user_id: u.user.id,
        exercise_id: r.exercise_id,
        set_number: n,
        position: pos,
        weight_kg: past?.weight_kg ?? r.target_weight_kg ?? null,
        reps: past?.reps ?? r.target_reps ?? null,
        planned_rest_seconds: past?.planned_rest_seconds ?? DEFAULT_REST,
      });
    }
  }
  if (inserts.length === 0) return;
  const { error } = await (supabase as any).from("workout_sets").insert(inserts);
  if (error) throw error;
  await touchSession(sessionId);
}

/**
 * Compare current session's best weight per exercise vs the exercise's PR
 * BEFORE this session — used to render trophies in the overview.
 */
export async function getPriorPRs(
  exerciseIds: string[],
  excludeSessionId: string,
): Promise<Record<string, number>> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user || exerciseIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from("workout_sets")
    .select("exercise_id, weight_kg")
    .eq("user_id", u.user.id)
    .in("exercise_id", exerciseIds)
    .not("completed_at", "is", null)
    .neq("session_id", excludeSessionId);
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { exercise_id: string; weight_kg: number | null }[]) {
    map[row.exercise_id] = Math.max(map[row.exercise_id] ?? 0, row.weight_kg ?? 0);
  }
  return map;
}

