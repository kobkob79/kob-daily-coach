/**
 * Intel 8-day work cycle.
 *
 *   Day 0 : Day shift 1   (08:15 – 20:30)
 *   Day 1 : Day shift 2   (08:15 – 20:30)
 *   Day 2 : Night shift 1 (20:15 – 08:30 next morning)
 *           → the morning/afternoon of this calendar day is spent resting
 *             at home in preparation for the night. It is NOT a separate
 *             calendar day.
 *   Day 3 : Night shift 2 (20:15 – 08:30 next morning)
 *   Day 4 : Off 1  (morning-after-night sleep counts here)
 *   Day 5 : Off 2
 *   Day 6 : Off 3
 *   Day 7 : Off 4
 *   → repeat
 *
 * `anchor_date` in `shift_config` is the calendar date of Day 0 (first day shift).
 * `anchor_shift` is kept for backward compatibility but ignored by the new
 * `intel_9d` pattern id (name preserved to avoid a data migration).
 */
import { startOfDay, differenceInCalendarDays, addDays, format } from "date-fns";

export type ShiftKind = "day" | "night" | "off" | "half_rest";

export interface ShiftConfig {
  anchor_date: string;
  anchor_shift: "day" | "night";
  pattern: string; // 'intel_9d' | legacy '4on4off'
}

const INTEL_CYCLE: ShiftKind[] = [
  "day",
  "day",
  "night",
  "night",
  "off",
  "off",
  "off",
  "off",
];

export function getShiftForDate(cfg: ShiftConfig, date: Date): ShiftKind {
  return getShiftPositionForDate(cfg, date).shift;
}

/** Position within the current phase (1-based). E.g. Day 2 → {shift:'day', indexInPhase:2}. */
export function getShiftPositionForDate(
  cfg: ShiftConfig,
  date: Date,
): { shift: ShiftKind; indexInPhase: number } {
  const anchor = startOfDay(new Date(cfg.anchor_date));
  const target = startOfDay(date);
  const diff = differenceInCalendarDays(target, anchor);

  if (cfg.pattern === "intel_9d" || !cfg.pattern) {
    const pos = ((diff % INTEL_CYCLE.length) + INTEL_CYCLE.length) % INTEL_CYCLE.length;
    const shift = INTEL_CYCLE[pos];
    let indexInPhase = 1;
    if (shift === "day") indexInPhase = pos + 1;         // 0→1, 1→2
    else if (shift === "night") indexInPhase = pos - 1;  // 2→1, 3→2
    else indexInPhase = pos - 3;                          // 4→1..7→4
    return { shift, indexInPhase };
  }

  // Legacy fallback (4 on / 4 off, 16-day cycle) — retained so existing rows
  // keep rendering correctly if any lingered on the old pattern.
  const pos = ((diff % 16) + 16) % 16;
  const anchorShift: ShiftKind = cfg.anchor_shift;
  if (pos < 4) return { shift: anchorShift, indexInPhase: pos + 1 };
  if (pos < 8) return { shift: "off", indexInPhase: pos - 3 };
  if (pos < 12)
    return {
      shift: anchorShift === "day" ? "night" : "day",
      indexInPhase: pos - 7,
    };
  return { shift: "off", indexInPhase: pos - 11 };
}

export interface ShiftDay {
  date: Date;
  iso: string;
  label: string;
  shift: ShiftKind;
  indexInPhase: number;
}

export function getShiftRange(cfg: ShiftConfig, start: Date, days: number): ShiftDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const { shift, indexInPhase } = getShiftPositionForDate(cfg, d);
    return {
      date: d,
      iso: format(d, "yyyy-MM-dd"),
      label: format(d, "EEE d MMM"),
      shift,
      indexInPhase,
    };
  });
}

export const SHIFT_HOURS: Record<ShiftKind, string> = {
  day: "08:15–20:30",
  night: "20:15–08:30",
  half_rest: "מנוחה",
  off: "—",
};

export const SHIFT_STYLES: Record<ShiftKind, { label: string; className: string; dot: string }> = {
  day: {
    label: "יום",
    className: "bg-primary/15 text-primary border-primary/40",
    dot: "bg-primary",
  },
  night: {
    label: "לילה",
    className: "bg-accent/15 text-accent border-accent/40",
    dot: "bg-accent",
  },
  half_rest: {
    label: "מנוחה",
    className: "bg-warning/15 text-warning border-warning/40",
    dot: "bg-warning",
  },
  off: {
    label: "חופש",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};
