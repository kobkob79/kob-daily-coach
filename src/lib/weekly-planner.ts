/**
 * Weekly Planner 2.0 helpers (VIORA-PLANNER-001).
 *
 * Planning-only utilities: view-mode persistence, per-week initialisation
 * state (so a new week is never auto-copied), duration estimation and
 * status derivation. Never touches workout execution data.
 */

export type PlannerMode = "planned" | "week";

const MODE_KEY = "viora.planner.mode";
const WEEK_KEY_PREFIX = "viora.planner.week.";

/* ------------------------- week identity ------------------------- */

/** Sunday-based start of the week containing `d`. */
export function startOfWeek(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/** Stable key for a week, e.g. "2026-08-02". */
export function weekKey(d: Date = new Date()): string {
  const s = startOfWeek(d);
  const m = `${s.getMonth() + 1}`.padStart(2, "0");
  const day = `${s.getDate()}`.padStart(2, "0");
  return `${s.getFullYear()}-${m}-${day}`;
}

/** Date of `weekday` (0=Sunday) inside the current week. */
export function dateForWeekday(weekday: number): Date {
  const d = startOfWeek();
  d.setDate(d.getDate() + weekday);
  return d;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export function formatWeekRange(d: Date = new Date()): string {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return `${formatShortDate(s)} – ${formatShortDate(e)}`;
}

/* ------------------------- persistence ------------------------- */

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — planner still works, just not remembered */
  }
}

export function loadMode(): PlannerMode {
  return safeGet(MODE_KEY) === "week" ? "week" : "planned";
}

export function saveMode(mode: PlannerMode): void {
  safeSet(MODE_KEY, mode);
}

/** True once the user explicitly chose how to start this week. */
export function isWeekInitialized(key = weekKey()): boolean {
  return safeGet(WEEK_KEY_PREFIX + key) === "1";
}

export function markWeekInitialized(key = weekKey()): void {
  safeSet(WEEK_KEY_PREFIX + key, "1");
}

/* ------------------------- estimation ------------------------- */

/** Rough session length: ~3.5 min per working set, 8 min floor per exercise. */
export function estimateMinutes(exerciseCount: number, setCount: number): number {
  if (!exerciseCount) return 0;
  const bySets = setCount * 3.5;
  const byExercises = exerciseCount * 8;
  return Math.max(15, Math.round(Math.max(bySets, byExercises) / 5) * 5);
}

export function formatMinutes(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min} דק׳`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${`${m}`.padStart(2, "0")} שע׳` : `${h} שע׳`;
}

/* ------------------------- status ------------------------- */

export type DayStatus = "completed" | "today" | "planned" | "missed" | "rest" | "empty";

export const STATUS_META: Record<DayStatus, { label: string; dot: string; chip: string }> = {
  completed: {
    label: "הושלם",
    dot: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  today: {
    label: "היום",
    dot: "bg-sky-400",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  planned: {
    label: "מתוכנן",
    dot: "bg-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  missed: {
    label: "לא בוצע",
    dot: "bg-rose-400",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  rest: {
    label: "יום מנוחה",
    dot: "bg-muted-foreground",
    chip: "bg-muted/60 text-muted-foreground border-border",
  },
  empty: {
    label: "פנוי",
    dot: "bg-muted",
    chip: "bg-muted/40 text-muted-foreground border-border",
  },
};

export function deriveStatus(opts: {
  assigned: boolean;
  rest: boolean;
  completed: boolean;
  weekday: number;
  today: number;
}): DayStatus {
  if (opts.completed) return "completed";
  if (!opts.assigned) return opts.rest ? "rest" : "empty";
  if (opts.weekday === opts.today) return "today";
  return opts.weekday < opts.today ? "missed" : "planned";
}
