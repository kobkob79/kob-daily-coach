/**
 * Home Insight — a reusable, JSON-safe summary of the user's day used by
 * the Home screen's assistant cards (Daily Brief, Three Priorities,
 * Progress Overview) and, in the future, by the AI Coach.
 *
 * Rules:
 *  • Never invents values. Missing data is simply omitted.
 *  • Never generates medical advice.
 *  • Uses ONLY numbers already computed by the dashboard — no duplicate
 *    aggregation, no extra Supabase calls.
 */
import type { DayContext } from "@/lib/day-context";
import type { ShiftKind } from "@/lib/shift";

export interface HomeInsightInput {
  now: Date;
  displayName: string;
  dayContext: DayContext | null;
  shift: ShiftKind | null;
  cycleDay: number | null;
  lastSleepHours: number | null;
  avgSleepHours: number | null;
  proteinToday: number;
  proteinTarget: number;
  waterMlToday: number;
  waterTargetMl: number;
  waterYesterdayPct: number | null;
  workoutTodayMinutes: number;
  plannedWorkoutToday: boolean | null;
  stepsToday: number | null;
  stepsTarget: number | null;
}

export interface HomePriority {
  id: string;
  emoji: string;
  title: string;
  hint?: string;
}

export type HomeProgressKey = "water" | "protein" | "workout" | "steps";

export interface HomeProgressItem {
  key: HomeProgressKey;
  label: string;
  value: number;      // current
  target: number;     // 0 means "no target set"
  unit: string;
  pct: number;        // 0..100 (0 if no target)
  display: string;    // human formatted "1.2 / 2.5 L"
}

export interface HomeInsight {
  greeting: string;
  headline: string;
  briefLines: string[];
  priorities: HomePriority[];
  progress: HomeProgressItem[];
  hasEnoughData: boolean;
}

/** Time-of-day + day-context aware greeting, in Hebrew. */
export function buildGreeting(now: Date, ctx: DayContext | null, name: string): string {
  const h = now.getHours();
  const base =
    h < 5 ? "לילה טוב" :
    h < 12 ? "בוקר טוב" :
    h < 17 ? "צהריים טובים" :
    h < 21 ? "ערב טוב" : "לילה טוב";
  const who = name ? `, ${name}` : "";
  if (!ctx) return `${base}${who}`;
  if (ctx.isNightShift) return `${base}${who} — לילה של משמרת`;
  if (ctx.isDayOff) return `${base}${who} — יום חופש`;
  if (ctx.isDayShift) return `${base}${who} — יום עבודה`;
  return `${base}${who}`;
}

function shiftLabel(shift: ShiftKind | null, cycleDay: number | null): string | null {
  if (!shift) return null;
  if (shift === "day") return cycleDay ? `היום זה יום ${cycleDay} של משמרת יום` : "היום משמרת יום";
  if (shift === "night") return cycleDay ? `היום זה לילה ${cycleDay === 3 ? 1 : Math.max(1, cycleDay - 2)} של משמרת לילה` : "היום משמרת לילה";
  if (shift === "half_rest") return "היום יום מנוחה חצי-יום לפני הלילה";
  return "היום יום חופש";
}

function round(n: number): number {
  return Math.round(n);
}

function fmtWater(ml: number): string {
  return `${(ml / 1000).toFixed(1)}L`;
}

export function buildHomeInsight(input: HomeInsightInput): HomeInsight {
  const {
    now, displayName, dayContext, shift, cycleDay,
    lastSleepHours, avgSleepHours,
    proteinToday, proteinTarget,
    waterMlToday, waterTargetMl, waterYesterdayPct,
    workoutTodayMinutes, plannedWorkoutToday,
    stepsToday, stepsTarget,
  } = input;

  /* ---------- Brief lines (facts only) ---------- */
  const brief: string[] = [];
  const sl = shiftLabel(shift, cycleDay);
  if (sl) brief.push(`• ${sl}.`);
  if (lastSleepHours != null && lastSleepHours > 0) {
    const hh = Math.floor(lastSleepHours);
    const mm = Math.round((lastSleepHours - hh) * 60);
    brief.push(`• ישנת ${hh}ש׳ ${mm ? mm + "ד׳" : ""}${avgSleepHours && lastSleepHours + 0.4 < avgSleepHours ? ` — פחות מהממוצע השבועי (${avgSleepHours.toFixed(1)}ש׳)` : ""}.`);
  }
  if (waterYesterdayPct != null) {
    brief.push(`• אתמול הגעת ל־${Math.min(100, Math.round(waterYesterdayPct))}% מיעד השתייה.`);
  }
  if (plannedWorkoutToday) {
    brief.push(`• יש לך אימון מתוכנן להיום.`);
  } else if (workoutTodayMinutes > 0) {
    brief.push(`• סיימת אימון של ${workoutTodayMinutes} דקות היום.`);
  }

  /* ---------- Priorities (max 3, ordered by impact) ---------- */
  const priorities: HomePriority[] = [];
  const waterLeft = Math.max(0, waterTargetMl - waterMlToday);
  const proteinLeft = Math.max(0, proteinTarget - proteinToday);

  // Water: only if there is a meaningful gap
  if (waterTargetMl > 0 && waterLeft >= 250) {
    const nextSip = Math.min(500, waterLeft);
    priorities.push({
      id: "water",
      emoji: "💧",
      title: `שתה ${nextSip} מ״ל מים${dayContext?.isDayShift ? " לפני היציאה לעבודה" : ""}`,
      hint: `נותרו ${fmtWater(waterLeft)} להיעד היומי`,
    });
  }

  // Protein: only if meaningful gap
  if (proteinTarget > 0 && proteinLeft >= 15) {
    priorities.push({
      id: "protein",
      emoji: "🍗",
      title: `הגע ליעד החלבון של היום`,
      hint: `נותרו ${round(proteinLeft)}g מתוך ${proteinTarget}g`,
    });
  }

  // Workout
  if (workoutTodayMinutes === 0 && plannedWorkoutToday) {
    priorities.push({
      id: "workout",
      emoji: "🏋️",
      title: `השלם את האימון של היום`,
      hint: `סמנת אימון מתוכנן — נותר לבצע`,
    });
  } else if (workoutTodayMinutes === 0 && dayContext?.isDayOff) {
    priorities.push({
      id: "workout-off",
      emoji: "🏃",
      title: `שלב תנועה קלה — יום חופש מושלם לזה`,
    });
  }

  // Sleep — surface only if clearly short
  if (priorities.length < 3 && lastSleepHours != null && lastSleepHours > 0 && lastSleepHours < 6) {
    priorities.push({
      id: "recover",
      emoji: "😴",
      title: `שים דגש על התאוששות היום`,
      hint: `ישנת רק ${lastSleepHours.toFixed(1)} שעות בלילה שעברה`,
    });
  }

  const three = priorities.slice(0, 3);

  /* ---------- Progress Overview ---------- */
  const progress: HomeProgressItem[] = [];
  if (waterTargetMl > 0) {
    progress.push({
      key: "water",
      label: "מים",
      value: waterMlToday,
      target: waterTargetMl,
      unit: "L",
      pct: Math.min(100, Math.round((waterMlToday / waterTargetMl) * 100)),
      display: `${(waterMlToday / 1000).toFixed(1)} / ${(waterTargetMl / 1000).toFixed(1)} L`,
    });
  }
  if (proteinTarget > 0) {
    progress.push({
      key: "protein",
      label: "חלבון",
      value: proteinToday,
      target: proteinTarget,
      unit: "g",
      pct: Math.min(100, Math.round((proteinToday / proteinTarget) * 100)),
      display: `${round(proteinToday)} / ${proteinTarget} g`,
    });
  }
  {
    const target = plannedWorkoutToday ? 30 : 0;
    progress.push({
      key: "workout",
      label: "אימון",
      value: workoutTodayMinutes,
      target,
      unit: "ד׳",
      pct: target > 0 ? Math.min(100, Math.round((workoutTodayMinutes / target) * 100)) : (workoutTodayMinutes > 0 ? 100 : 0),
      display: workoutTodayMinutes > 0
        ? `${workoutTodayMinutes} ד׳`
        : plannedWorkoutToday ? "טרם בוצע" : "אין אימון מתוכנן",
    });
  }
  if (stepsToday != null && (stepsTarget ?? 0) > 0) {
    progress.push({
      key: "steps",
      label: "צעדים",
      value: stepsToday,
      target: stepsTarget!,
      unit: "",
      pct: Math.min(100, Math.round((stepsToday / stepsTarget!) * 100)),
      display: `${stepsToday.toLocaleString()} / ${stepsTarget!.toLocaleString()}`,
    });
  }

  /* ---------- Conversational headline (max ~2 sentences) ---------- */
  const greeting = buildGreeting(now, dayContext, displayName);
  let headline = "";
  if (dayContext?.isNightShift) headline = "לילה של משמרת — נשמור על אנרגיה וקצב שתייה.";
  else if (dayContext?.isDayShift) headline = "היום נראה עמוס — כמה צעדים חכמים יעשו הבדל.";
  else if (dayContext?.isDayOff) headline = "יום חופש — הזדמנות להתאוששות ותנועה איכותית.";
  else headline = "בוא נעבור על מה שחשוב היום.";

  // "Enough data" means we have at least a shift context or a meaningful metric.
  const hasEnoughData = brief.length > 0 || three.length > 0 || progress.some((p) => p.value > 0);

  return { greeting, headline, briefLines: brief, priorities: three, progress, hasEnoughData };
}
