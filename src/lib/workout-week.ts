/**
 * Shared workout-week selectors (VIORA-WORKOUT-INTEGRATION-001, credit 3).
 *
 * ONE source of truth for every screen that answers a dated question about
 * workouts: the Weekly Planner, the Workout Hub and the Home dashboard.
 * All of them read persisted `workout_instances` (credit 2) — never the
 * legacy session/slot heuristics — and share one duration formula and one
 * template-meta query, so the same week can never show two different numbers.
 */
import { supabase } from "@/integrations/supabase/client";
import { estimateMinutes } from "@/lib/weekly-planner";
import {
  dateKey,
  startOfWeek,
  viewState,
  weekDates,
  type InstanceViewState,
  type WorkoutInstance,
} from "@/lib/workout-instance";

/* --------------------------- template meta --------------------------- */

export type TemplateMeta = { exercises: number; sets: number; focus: string | null };

/** Single cache key — Hub and Planner must never issue two different queries. */
export const TEMPLATE_META_QUERY_KEY = ["workout_template_meta"] as const;

export async function fetchTemplateMeta(): Promise<Map<string, TemplateMeta>> {
  const { data, error } = await supabase
    .from("workout_template_exercises")
    .select("template_id,target_sets,exercises(muscle_group,category)");
  if (error) throw error;

  const map = new Map<string, TemplateMeta>();
  const groupsByTemplate = new Map<string, Map<string, number>>();

  for (const row of (data ?? []) as unknown as {
    template_id: string;
    target_sets: number | null;
    exercises: { muscle_group: string | null; category: string | null } | null;
  }[]) {
    const cur = map.get(row.template_id) ?? { exercises: 0, sets: 0, focus: null };
    cur.exercises += 1;
    cur.sets += row.target_sets ?? 3;
    map.set(row.template_id, cur);

    const group = row.exercises?.muscle_group ?? row.exercises?.category;
    if (group) {
      const groups = groupsByTemplate.get(row.template_id) ?? new Map<string, number>();
      groups.set(group, (groups.get(group) ?? 0) + 1);
      groupsByTemplate.set(row.template_id, groups);
    }
  }

  for (const [templateId, groups] of groupsByTemplate) {
    const meta = map.get(templateId);
    if (!meta) continue;
    const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    meta.focus = top.length ? top.map(([group]) => group).join(" · ") : null;
  }

  return map;
}

export function templateMetaQuery() {
  return { queryKey: TEMPLATE_META_QUERY_KEY, queryFn: fetchTemplateMeta };
}

/** The ONLY duration estimate in the app. */
export function metaMinutes(meta: TemplateMeta | null | undefined): number {
  if (!meta) return 0;
  return estimateMinutes(meta.exercises, meta.sets);
}

/* --------------------------- week view --------------------------- */

export interface WeekDayInstance {
  weekday: number;
  date: Date;
  instance: WorkoutInstance | null;
  state: InstanceViewState | null;
}

function rank(state: InstanceViewState): number {
  // What a planning screen should surface first for one calendar day.
  switch (state) {
    case "active":
      return 0;
    case "overdue":
      return 1;
    case "partial":
      return 2;
    case "planned":
      return 3;
    case "completed":
      return 4;
    default:
      return 5;
  }
}

/** One representative instance per weekday of the visible week. */
export function selectWeekDays(
  instances: WorkoutInstance[],
  weekStart: Date = startOfWeek(),
  today: string = dateKey(),
): WeekDayInstance[] {
  const dates = weekDates(weekStart);
  return dates.map((date, weekday) => {
    const key = dateKey(date);
    const forDay = instances
      .filter((i) => i.scheduled_date === key)
      .map((i) => ({ i, state: viewState(i, today) }))
      .sort((a, b) => rank(a.state) - rank(b.state));
    const chosen = forDay[0];
    return {
      weekday,
      date,
      instance: chosen?.i ?? null,
      state: chosen?.state ?? null,
    };
  });
}

/* --------------------------- next action --------------------------- */

export type NextActionKind = "overdue" | "today" | "next";

export interface NextActionItem {
  kind: NextActionKind;
  instance: WorkoutInstance;
}

/**
 * "What now?" ordering, shared by the Hub:
 * overdue (oldest first) → today → the next dated planned instance.
 * The active session is handled by the caller (it always wins).
 */
export function selectActionQueue(
  instances: WorkoutInstance[],
  today: string = dateKey(),
): NextActionItem[] {
  const open = instances
    .filter((i) => i.status === "planned" || i.status === "partial")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const overdue = open
    .filter((i) => i.scheduled_date < today)
    .map((instance): NextActionItem => ({ kind: "overdue", instance }));
  const todays = open
    .filter((i) => i.scheduled_date === today)
    .map((instance): NextActionItem => ({ kind: "today", instance }));
  const upcoming = open
    .filter((i) => i.scheduled_date > today)
    .map((instance): NextActionItem => ({ kind: "next", instance }));

  return [...overdue, ...todays, ...upcoming];
}

/* --------------------------- weekly progress --------------------------- */

export interface WeeklyWorkoutProgress {
  /** Completed instances scheduled inside the week. */
  completed: number;
  /** Instances planned for the week (skipped days excluded). */
  planned: number;
  /** Still actionable this week (planned / partial / active / overdue). */
  remaining: number;
  goal: number;
  pct: number;
  /** Consecutive days ending today/yesterday with a completed workout. */
  streakDays: number;
  totalMinutes: number;
}

function completionDate(inst: WorkoutInstance): string {
  return inst.completed_at ? dateKey(new Date(inst.completed_at)) : inst.scheduled_date;
}

/**
 * The single weekly-progress selector. Home and Planner both call this, so
 * they can never disagree about the same week.
 *
 * `instances` may cover any range (extra dates are ignored for the week
 * counters but still feed the streak).
 */
export function selectWeeklyProgress(
  instances: WorkoutInstance[],
  options: {
    weekStart?: Date;
    today?: string;
    goal?: number;
    meta?: Map<string, TemplateMeta>;
  } = {},
): WeeklyWorkoutProgress {
  const weekStart = options.weekStart ?? startOfWeek();
  const today = options.today ?? dateKey();
  const dates = weekDates(weekStart).map((d) => dateKey(d));
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;

  const inWeek = instances.filter(
    (i) => i.scheduled_date >= first && i.scheduled_date <= last && i.status !== "skipped",
  );
  const completed = inWeek.filter((i) => i.status === "completed").length;
  const remaining = inWeek.filter((i) => i.status !== "completed").length;
  const planned = inWeek.length;
  const goal = options.goal && options.goal > 0 ? options.goal : planned;
  const pct = goal > 0 ? Math.min(100, Math.round((completed / goal) * 100)) : 0;

  const totalMinutes = options.meta
    ? inWeek.reduce(
        (sum, i) => sum + (i.template_id ? metaMinutes(options.meta!.get(i.template_id)) : 0),
        0,
      )
    : 0;

  const done = new Set(
    instances.filter((i) => i.status === "completed").map((i) => completionDate(i)),
  );
  let streakDays = 0;
  const cursor = new Date(`${today}T00:00:00`);
  if (!done.has(today)) cursor.setDate(cursor.getDate() - 1);
  for (let guard = 0; guard < 400; guard++) {
    if (!done.has(dateKey(cursor))) break;
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { completed, planned, remaining, goal, pct, streakDays, totalMinutes };
}
