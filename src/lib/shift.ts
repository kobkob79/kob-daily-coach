/**
 * Intel 9-day work cycle.
 *
 *   Day 0 : Day shift 1   (08:15 – 20:30)
 *   Day 1 : Day shift 2   (08:15 – 20:30)
 *   Day 2 : Half-rest day (recover / prep / sleep before nights)
 *   Day 3 : Night shift 1 (20:15 – 08:30)
 *   Day 4 : Night shift 2 (20:15 – 08:30)
 *   Day 5 : Off 1  (morning-after-night sleep counts here)
 *   Day 6 : Off 2
 *   Day 7 : Off 3
 *   Day 8 : Off 4
 *   → repeat
 *
 * `anchor_date` in `shift_config` is the calendar date of Day 0 (first day shift).
 * `anchor_shift` is kept for backward compatibility but ignored by the new
 * `intel_9d` pattern.
 */
import { startOfDay, differenceInCalendarDays, addDays, format } from "date-fns";

export type ShiftKind = "day" | "half_rest" | "night" | "off";

export interface ShiftConfig {
  anchor_date: string;
  anchor_shift: "day" | "night";
  pattern: string; // 'intel_9d' | legacy '4on4off'
}

const INTEL_CYCLE: ShiftKind[] = [
  "day",
  "day",
  "half_rest",
  "night",
  "night",
  "off",
  "off",
  "off",
  "off",
];

export function getShiftForDate(cfg: ShiftConfig, date: Date): ShiftKind {
  const anchor = startOfDay(new Date(cfg.anchor_date));
  const target = startOfDay(date);
  const diff = differenceInCalendarDays(target, anchor);

  if (cfg.pattern === "intel_9d" || !cfg.pattern) {
    const pos = ((diff % INTEL_CYCLE.length) + INTEL_CYCLE.length) % INTEL_CYCLE.length;
    return INTEL_CYCLE[pos];
  }

  // Legacy fallback (4 on / 4 off, 16-day cycle) — retained so existing rows
  // keep rendering correctly if any lingered on the old pattern.
  const pos = ((diff % 16) + 16) % 16;
  if (pos < 4) return cfg.anchor_shift;
  if (pos < 8) return "off";
  if (pos < 12) return cfg.anchor_shift === "day" ? "night" : "day";
  return "off";
}

export interface ShiftDay {
  date: Date;
  iso: string;
  label: string;
  shift: ShiftKind;
}

export function getShiftRange(cfg: ShiftConfig, start: Date, days: number): ShiftDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    return {
      date: d,
      iso: format(d, "yyyy-MM-dd"),
      label: format(d, "EEE d MMM"),
      shift: getShiftForDate(cfg, d),
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
