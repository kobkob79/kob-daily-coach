/**
 * Timeline aggregation + Smart Coach logic.
 *
 * Merges every domain event of the current biological day into a single
 * chronological list. Pure functions — UI-agnostic so future surfaces
 * (widgets, notifications, AI summariser) can consume the same shapes.
 */
import { differenceInMinutes, format, parseISO } from "date-fns";
import type { ShiftConfig } from "@/lib/shift";
import { getShiftPositionForDate } from "@/lib/shift";
import { t } from "@/lib/i18n";

export type TimelineKind =
  | "meal"
  | "water"
  | "workout"
  | "supplement"
  | "weight"
  | "sleep"
  | "health";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  time: Date;
  emoji: string;
  title: string;
  subtitle?: string;
}

/* ---------- Raw row types (subset of DB shapes we care about) ---------- */
interface MealRow {
  id: string;
  meal_time: string | null;
  created_at: string;
  meal_type: string | null;
  food_name: string | null;
  calories: number | null;
  protein_g: number | null;
}
interface WorkoutRow {
  id: string;
  date: string;
  name: string | null;
  duration_min: number | null;
  created_at?: string | null;
}
interface HealthRow {
  id: string;
  date: string;
  area: string;
  pain_level: number | null;
  created_at: string;
}
interface DailyEventRow {
  id: string;
  kind: string;
  event_time: string;
  amount: number | null;
  unit: string | null;
  label: string | null;
  emoji: string | null;
}

/* ---------- Adapters ---------- */
function timeFromMealRow(m: MealRow, fallbackDay: string): Date {
  if (m.meal_time) {
    // meal_time is HH:mm:ss — combine with biological day
    return parseISO(`${fallbackDay}T${m.meal_time}`);
  }
  return new Date(m.created_at);
}

const AREA_HE: Record<string, string> = {
  neck: "צוואר",
  sciatica: "גב תחתון",
  ac_joint: "כתף",
  general: "כללי",
};

export function buildTimeline(opts: {
  bioDay: string;
  meals: MealRow[];
  workouts: WorkoutRow[];
  health: HealthRow[];
  events: DailyEventRow[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const m of opts.meals) {
    const time = timeFromMealRow(m, opts.bioDay);
    const macros: string[] = [];
    if (m.calories) macros.push(`${m.calories} ${t("common.kcal")}`);
    if (m.protein_g) macros.push(`P${Math.round(Number(m.protein_g))}`);
    items.push({
      id: `meal-${m.id}`,
      kind: "meal",
      time,
      emoji: "🍽",
      title: m.food_name || m.meal_type || t("timeline.meal"),
      subtitle: [m.meal_type, macros.join(" · ")].filter(Boolean).join(" · "),
    });
  }

  for (const w of opts.workouts) {
    items.push({
      id: `workout-${w.id}`,
      kind: "workout",
      time: w.created_at ? new Date(w.created_at) : parseISO(`${w.date}T12:00`),
      emoji: "🏋",
      title: w.name || t("timeline.workout"),
      subtitle: w.duration_min ? `${w.duration_min} ${t("common.minutes")}` : undefined,
    });
  }

  for (const h of opts.health) {
    items.push({
      id: `health-${h.id}`,
      kind: "health",
      time: new Date(h.created_at),
      emoji: "❤️",
      title: `${t("timeline.health")} · ${AREA_HE[h.area] ?? h.area}`,
      subtitle: h.pain_level != null ? `${t("health.pain")} ${h.pain_level}/10` : undefined,
    });
  }

  for (const e of opts.events) {
    const time = new Date(e.event_time);
    if (e.kind === "water") {
      items.push({
        id: `evt-${e.id}`,
        kind: "water",
        time,
        emoji: e.emoji ?? "💧",
        title: `${e.amount ?? ""} ${e.unit ?? "מ״ל"} ${t("timeline.water")}`.trim(),
      });
    } else if (e.kind === "supplement") {
      items.push({
        id: `evt-${e.id}`,
        kind: "supplement",
        time,
        emoji: e.emoji ?? "💊",
        title: e.label ?? t("timeline.supplement"),
      });
    } else if (e.kind === "weight") {
      items.push({
        id: `evt-${e.id}`,
        kind: "weight",
        time,
        emoji: e.emoji ?? "⚖",
        title: `${e.amount ?? ""} ${e.unit ?? "ק״ג"}`.trim(),
        subtitle: t("timeline.weight"),
      });
    } else if (e.kind === "sleep") {
      items.push({
        id: `evt-${e.id}`,
        kind: "sleep",
        time,
        emoji: e.emoji ?? "😴",
        title: `${e.amount ?? ""} ${e.unit ?? "שעות"}`.trim(),
        subtitle: t("timeline.sleep"),
      });
    }
  }

  return items.sort((a, b) => b.time.getTime() - a.time.getTime());
}

export function formatItemTime(d: Date) {
  return format(d, "HH:mm");
}

/* ---------- Smart Coach ---------- */

export interface CoachHint {
  id: string;
  tone: "info" | "warn" | "good";
  text: string;
}

export interface CoachMemory {
  supplementsMissingToday?: { name: string }[];
  mealHabitHint?: { time: string; food: string } | null;
  weightTrend30d?: { deltaKg: number } | null;
  proteinStreak?: number;
  daysSinceFish?: number | null;
  sleepLow?: { lastH: number; avgH: number } | null;
  painTrendUp?: { area: string } | null;
}

export interface CoachInput {
  now: Date;
  proteinToday: number;
  proteinTarget: number;
  waterMlToday: number;
  waterTargetMl: number;
  lastWaterAt: Date | null;
  lastMealAt: Date | null;
  workoutLoggedToday: boolean;
  shiftConfig: ShiftConfig | null;
  memory?: CoachMemory;
}

export function buildCoachHints(i: CoachInput): CoachHint[] {
  const hints: CoachHint[] = [];

  // Shift context
  if (i.shiftConfig) {
    const { shift, indexInPhase } = getShiftPositionForDate(i.shiftConfig, i.now);
    const key =
      shift === "night" && indexInPhase === 1
        ? "coach.shift.night1"
        : `coach.shift.${shift}`;
    hints.push({ id: "shift", tone: "info", text: t(key) });
  }

  // Protein
  const proteinPct = i.proteinTarget > 0 ? i.proteinToday / i.proteinTarget : 0;
  const proteinLeft = Math.max(0, Math.round(i.proteinTarget - i.proteinToday));
  if (proteinPct >= 1) {
    hints.push({ id: "protein", tone: "good", text: t("coach.protein.done") });
  } else if (proteinPct >= 0.7) {
    hints.push({
      id: "protein",
      tone: "good",
      text: t("coach.protein.almost").replace("{pct}", String(Math.round(proteinPct * 100))),
    });
  } else if (proteinLeft > 0) {
    hints.push({
      id: "protein",
      tone: "warn",
      text: t("coach.protein.left").replace("{g}", String(proteinLeft)),
    });
  }

  // Water gap
  if (i.lastWaterAt) {
    const gap = Math.floor(differenceInMinutes(i.now, i.lastWaterAt) / 60);
    if (gap >= 3) {
      hints.push({
        id: "water",
        tone: "warn",
        text: t("coach.water.gap").replace("{h}", String(gap)),
      });
    }
  } else if (i.now.getHours() >= 9) {
    hints.push({ id: "water", tone: "warn", text: t("coach.water.none") });
  }

  // Workout nudge — only afternoon+ and only on day/off phases.
  if (!i.workoutLoggedToday && i.now.getHours() >= 16 && i.shiftConfig) {
    const { shift } = getShiftPositionForDate(i.shiftConfig, i.now);
    if (shift === "day" || shift === "off") {
      hints.push({ id: "workout", tone: "info", text: t("coach.workout.none") });
    }
  }

  // Meal gap
  if (i.lastMealAt) {
    const hours = Math.floor(differenceInMinutes(i.now, i.lastMealAt) / 60);
    if (hours >= 5 && i.now.getHours() >= 8 && i.now.getHours() <= 22) {
      hints.push({
        id: "meal-gap",
        tone: "warn",
        text: t("coach.meal.gap").replace("{h}", String(hours)),
      });
    }
  }

  // --- Personalised layer, driven by ai_memory ---
  if (i.memory?.mealHabitHint) {
    hints.push({
      id: "habit-meal",
      tone: "info",
      text: t("coach.habit.meal")
        .replace("{time}", i.memory.mealHabitHint.time)
        .replace("{food}", i.memory.mealHabitHint.food),
    });
  }

  for (const s of i.memory?.supplementsMissingToday ?? []) {
    hints.push({
      id: `supp-${s.name}`,
      tone: "warn",
      text: t("coach.habit.supplement").replace("{name}", s.name),
    });
  }

  if (i.memory?.weightTrend30d && i.memory.weightTrend30d.deltaKg !== 0) {
    const delta = i.memory.weightTrend30d.deltaKg;
    const key = delta < 0 ? "coach.weight.trend.down" : "coach.weight.trend.up";
    hints.push({
      id: "weight-trend",
      tone: delta < 0 ? "good" : "info",
      text: t(key).replace("{kg}", Math.abs(delta).toFixed(1)),
    });
  }

  if (i.memory?.proteinStreak && i.memory.proteinStreak >= 3) {
    hints.push({
      id: "protein-streak",
      tone: "good",
      text: t("coach.protein.streak").replace("{n}", String(i.memory.proteinStreak)),
    });
  }

  if (i.memory?.daysSinceFish != null && i.memory.daysSinceFish >= 5) {
    hints.push({
      id: "fish-gap",
      tone: "info",
      text: t("coach.fish.gap").replace("{d}", String(i.memory.daysSinceFish)),
    });
  }

  if (i.memory?.sleepLow) {
    hints.push({
      id: "sleep-low",
      tone: "warn",
      text: t("coach.sleep.low")
        .replace("{h}", i.memory.sleepLow.lastH.toFixed(1))
        .replace("{avg}", i.memory.sleepLow.avgH.toFixed(1)),
    });
  }

  if (i.memory?.painTrendUp) {
    const AREA_HE_MAP: Record<string, string> = {
      neck: "צוואר",
      sciatica: "גב תחתון",
      ac_joint: "כתף",
    };
    hints.push({
      id: `pain-${i.memory.painTrendUp.area}`,
      tone: "warn",
      text: t("coach.pain.trend").replace(
        "{area}",
        AREA_HE_MAP[i.memory.painTrendUp.area] ?? i.memory.painTrendUp.area,
      ),
    });
  }

  return hints.slice(0, 6);
}

