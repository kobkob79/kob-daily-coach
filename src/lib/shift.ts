import { startOfDay, differenceInCalendarDays, addDays, format } from "date-fns";

export type ShiftKind = "day" | "night" | "off";

export interface ShiftConfig {
  anchor_date: string; // ISO date
  anchor_shift: "day" | "night";
  pattern: string; // '4on4off'
}

// 4-on / 4-off: 4 days of anchor shift, then 4 off. 8-day cycle.
// After each on-block, the next on-block flips day <-> night.
// So the full cycle is 16 days: 4 on (anchor), 4 off, 4 on (flipped), 4 off.
export function getShiftForDate(cfg: ShiftConfig, date: Date): ShiftKind {
  const anchor = startOfDay(new Date(cfg.anchor_date));
  const target = startOfDay(date);
  const diff = differenceInCalendarDays(target, anchor);
  const cyclePos = ((diff % 16) + 16) % 16;
  if (cyclePos < 4) return cfg.anchor_shift;
  if (cyclePos < 8) return "off";
  if (cyclePos < 12) return cfg.anchor_shift === "day" ? "night" : "day";
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

export const SHIFT_STYLES: Record<ShiftKind, { label: string; className: string; dot: string }> = {
  day: {
    label: "Day 12h",
    className: "bg-primary/15 text-primary border-primary/40",
    dot: "bg-primary",
  },
  night: {
    label: "Night 12h",
    className: "bg-accent/15 text-accent border-accent/40",
    dot: "bg-accent",
  },
  off: {
    label: "Off",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};
