/**
 * Day Context engine.
 *
 * A tiny reusable service that answers the question every module needs to
 * ask ("what kind of day is today for this user?") without hard-coding any
 * company or shift pattern. Feeds the future AI coach, nutrition engine,
 * workout engine and reminder engine.
 *
 * Priority order for deriving the day kind:
 *   1. Developer override (localStorage `viora:dev:sim-day`) — dev tools.
 *   2. Shift worker → derive from `shift_config` cycle.
 *   3. Any other life context → weekday = work day, weekend = off.
 *   4. No profile info → treat as off / neutral.
 *
 * Consumers read via `useDayContext()` or the pure `getDayContext(...)`.
 */
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LifeContext, ShiftCycle } from "@/lib/life-profile";
import { fetchLifeProfile } from "@/lib/life-profile";

export type DayKind = "day" | "night" | "off";

export interface DayContext {
  date: string;         // yyyy-mm-dd of the calendar day
  kind: DayKind;
  isWorkDay: boolean;
  isDayShift: boolean;
  isNightShift: boolean;
  isDayOff: boolean;
  source: "override" | "shift" | "weekday" | "unknown";
  cycleDay: number | null;
  cycleLength: number | null;
  lifeContext: LifeContext | null;
}

const OVERRIDE_KEY = "viora:dev:sim-day";

export function getDayOverride(): DayKind | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(OVERRIDE_KEY);
  return raw === "day" || raw === "night" || raw === "off" ? raw : null;
}

export function setDayOverride(kind: DayKind | null) {
  if (typeof window === "undefined") return;
  if (kind) window.localStorage.setItem(OVERRIDE_KEY, kind);
  else window.localStorage.removeItem(OVERRIDE_KEY);
  window.dispatchEvent(new StorageEvent("storage", { key: OVERRIDE_KEY }));
}

/** Position within the shift cycle (0-based). */
function cyclePosition(cycle: ShiftCycle, date: Date): number {
  const anchor = startOfDay(new Date(cycle.anchor_date));
  const diff = differenceInCalendarDays(startOfDay(date), anchor);
  const len = Math.max(1, cycle.cycle_length);
  return ((diff % len) + len) % len;
}

/** Map a cycle position to day/night/off by counts. */
function kindFromCyclePosition(cycle: ShiftCycle, pos: number): DayKind {
  if (pos < cycle.day_shifts) return "day";
  if (pos < cycle.day_shifts + cycle.night_shifts) return "night";
  return "off";
}

export interface DayContextInput {
  lifeContext: LifeContext | null;
  shiftCycle: ShiftCycle | null;
  now?: Date;
  respectOverride?: boolean;
}

export function getDayContext(input: DayContextInput): DayContext {
  const now = input.now ?? new Date();
  const iso = format(now, "yyyy-MM-dd");

  const override = input.respectOverride === false ? null : getDayOverride();
  if (override) {
    return buildCtx(iso, override, "override", null, null, input.lifeContext);
  }

  if (input.lifeContext === "shift_worker" && input.shiftCycle) {
    const pos = cyclePosition(input.shiftCycle, now);
    const kind = kindFromCyclePosition(input.shiftCycle, pos);
    return buildCtx(iso, kind, "shift", pos + 1, input.shiftCycle.cycle_length, input.lifeContext);
  }

  if (input.lifeContext && input.lifeContext !== "retired") {
    const dow = now.getDay(); // 0=Sun … 6=Sat
    const isWeekend = dow === 5 || dow === 6; // Fri/Sat (IL work-week)
    return buildCtx(iso, isWeekend ? "off" : "day", "weekday", null, null, input.lifeContext);
  }

  return buildCtx(iso, "off", "unknown", null, null, input.lifeContext);
}

function buildCtx(
  date: string,
  kind: DayKind,
  source: DayContext["source"],
  cycleDay: number | null,
  cycleLength: number | null,
  lifeContext: LifeContext | null,
): DayContext {
  return {
    date,
    kind,
    isWorkDay: kind !== "off",
    isDayShift: kind === "day",
    isNightShift: kind === "night",
    isDayOff: kind === "off",
    source,
    cycleDay,
    cycleLength,
    lifeContext,
  };
}

/** React hook — reactive to profile / cycle / dev override changes. */
export function useDayContext(now: Date = new Date()) {
  return useQuery({
    queryKey: ["day-context", format(now, "yyyy-MM-dd")],
    queryFn: async () => {
      const profile = await fetchLifeProfile();
      return getDayContext({
        lifeContext: profile?.life_context ?? null,
        shiftCycle: profile?.shift_cycle ?? null,
        now,
      });
    },
    staleTime: 60_000,
  });
}

/** Utility for future engines that need a preview range (e.g. reminders). */
export function getDayContextRange(
  input: Omit<DayContextInput, "now">,
  start: Date,
  days: number,
): DayContext[] {
  return Array.from({ length: days }, (_, i) =>
    getDayContext({ ...input, now: addDays(start, i), respectOverride: false }),
  );
}

/** Convenience used by dev tools to fully clear a simulated day. */
export function clearDayOverride() {
  setDayOverride(null);
}

/** Namespaced storage helper for other dev-only flags. */
export const DEV_STORAGE_KEYS = {
  dayOverride: OVERRIDE_KEY,
} as const;
