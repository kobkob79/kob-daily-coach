/**
 * Weekly card occurrence matching.
 *
 * A "card occurrence" is one weekday slot in the weekly plan
 * (workout_plans.weekday). Two slots may point at the SAME template, so a
 * session can never be matched to a card by `template_id` alone.
 *
 * Source of truth:
 *  1. `workout_sessions.plan_weekday` — written when the session is started
 *     from a specific weekly card (added in VIORA-WORKOUT-STATE-002).
 *  2. Legacy sessions (plan_weekday IS NULL) fall back to a deterministic
 *     match: same template + same weekday as `started_at`, else the first
 *     still-unclaimed slot with that template.
 *
 * Every session claims AT MOST ONE occurrence, and every occurrence is
 * claimed by at most one session — so one completed session can never mark
 * two cards as done.
 *
 * Limitation (documented, intentionally not migrated in this sprint):
 * legacy sessions without `plan_weekday` are matched heuristically. A full
 * fix requires a persisted planned-occurrence identifier per scheduled
 * workout instance.
 */
import type { PlanSlot, SessionRow } from "@/lib/workout-session";

export type CardState = "planned" | "active" | "completed" | "locked";

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export interface OccurrenceMatch {
  /** weekday -> the completed session that fills that card this week */
  completedByWeekday: Map<number, SessionRow>;
  /** weekday of the card that owns the current in_progress session (if any) */
  activeWeekday: number | null;
}

/**
 * Deterministically map this week's sessions onto weekly plan slots.
 * `sessions` may contain any statuses / any dates; filtering happens here.
 */
export function matchSessionsToSlots(
  slots: PlanSlot[],
  sessions: SessionRow[],
  weekStart = startOfWeek(),
): OccurrenceMatch {
  const occ = slots
    .filter((s) => !!s.template_id)
    .sort((a, b) => a.weekday - b.weekday);

  const claimed = new Set<number>();
  const completedByWeekday = new Map<number, SessionRow>();
  let activeWeekday: number | null = null;

  const claim = (session: SessionRow): number | null => {
    const tpl = session.template_id;
    if (!tpl) return null;
    // 1. explicit occurrence link
    const pw = session.plan_weekday;
    if (pw != null && !claimed.has(pw)) {
      const slot = occ.find((s) => s.weekday === pw && s.template_id === tpl);
      if (slot) {
        claimed.add(pw);
        return pw;
      }
    }
    // 2. legacy: same template, started on that weekday
    const day = new Date(session.started_at).getDay();
    const sameDay = occ.find(
      (s) => s.weekday === day && s.template_id === tpl && !claimed.has(s.weekday),
    );
    if (sameDay) {
      claimed.add(sameDay.weekday);
      return sameDay.weekday;
    }
    // 3. legacy: first free slot with that template
    const anySlot = occ.find((s) => s.template_id === tpl && !claimed.has(s.weekday));
    if (anySlot) {
      claimed.add(anySlot.weekday);
      return anySlot.weekday;
    }
    return null;
  };

  // The in_progress session claims first so it always wins its own card.
  const active = sessions.find((s) => s.status === "in_progress") ?? null;
  if (active) activeWeekday = claim(active);

  const completed = sessions
    .filter(
      (s) =>
        s.status === "completed" &&
        !!s.finished_at &&
        new Date(s.finished_at) >= weekStart,
    )
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );

  for (const s of completed) {
    const weekday = claim(s);
    if (weekday != null) completedByWeekday.set(weekday, s);
  }

  return { completedByWeekday, activeWeekday };
}

export function cardState(
  weekday: number,
  hasTemplate: boolean,
  match: OccurrenceMatch,
  hasActiveSession: boolean,
): CardState {
  if (!hasTemplate) return "planned";
  if (match.activeWeekday === weekday) return "active";
  if (match.completedByWeekday.has(weekday)) return "completed";
  if (hasActiveSession) return "locked";
  return "planned";
}
