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

export type SessionStatus = "in_progress" | "completed" | "discarded";
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
}

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
    .update(patch)
    .eq("id", id);
  if (error) throw error;
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
  return data as SessionSet;
}

export async function updateSet(id: string, patch: Partial<SessionSet>): Promise<void> {
  const { error } = await (supabase as any)
    .from("workout_sets")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("workout_sets")
    .delete()
    .eq("id", id);
  if (error) throw error;
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
