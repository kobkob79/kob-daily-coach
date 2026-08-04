/**
 * Command Center (VIORA-HOME-001)
 *
 * Pure, JSON-safe logic for the Home screen "Command Center":
 *  • Adaptive greeting
 *  • Today's Focus (exactly ONE primary action)
 *  • Weekly progress + streak
 *
 * Rules:
 *  • No data fetching here. Only derivations from values the dashboard
 *    already has.
 *  • Never invents numbers. Missing data yields nulls / placeholders.
 */
import type { DayContext } from "@/lib/day-context";
import type { ShiftKind } from "@/lib/shift";

/* ------------------------------------------------------------------ */
/* Adaptive greeting                                                   */
/* ------------------------------------------------------------------ */

export interface GreetingInput {
  now: Date;
  firstName: string;
  dayContext: DayContext | null;
  shift: ShiftKind | null;
  hasPlannedWorkout: boolean;
  workoutDoneToday: boolean;
}

export interface AdaptiveGreeting {
  /** "בוקר טוב" */
  timeOfDay: string;
  /** First name or a neutral fallback. */
  name: string;
  /** Short contextual chip: "משמרת לילה" / "יום אימון" / "יום מנוחה". */
  context: string | null;
}

export function buildAdaptiveGreeting(input: GreetingInput): AdaptiveGreeting {
  const h = input.now.getHours();
  const timeOfDay =
    h < 5 ? "לילה טוב" :
    h < 12 ? "בוקר טוב" :
    h < 17 ? "צהריים טובים" :
    h < 21 ? "ערב טוב" : "לילה טוב";

  let context: string | null = null;
  if (input.shift === "night" || input.dayContext?.isNightShift) context = "משמרת לילה";
  else if (input.shift === "day" || input.dayContext?.isDayShift) context = "יום עבודה";
  else if (input.dayContext?.isDayOff) context = "יום חופש";

  if (input.workoutDoneToday) context = context ? `${context} · אימון הושלם` : "אימון הושלם";
  else if (input.hasPlannedWorkout) context = context ? `${context} · יום אימון` : "יום אימון";

  return { timeOfDay, name: input.firstName || "אורח", context };
}

/* ------------------------------------------------------------------ */
/* Today's Focus — exactly one action                                  */
/* ------------------------------------------------------------------ */

export type FocusId =
  | "checkin"
  | "workout"
  | "water"
  | "meal"
  | "recovery"
  | "rest";

export interface TodaysFocus {
  id: FocusId;
  emoji: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  /** Internal route for the CTA. */
  to: string;
  /** 0..100 — progress toward this focus, when measurable. */
  progress: number | null;
}

export interface FocusInput {
  now: Date;
  checkinDone: boolean;
  hasPlannedWorkout: boolean;
  workoutDoneToday: boolean;
  waterMl: number;
  waterTargetMl: number;
  proteinG: number;
  proteinTargetG: number;
  mealsCount: number;
  lastSleepHours: number | null;
  painLevel: number | null;
}

/**
 * Determines the single most valuable next action.
 * Order of evaluation is the priority order.
 */
export function buildTodaysFocus(i: FocusInput): TodaysFocus {
  const hour = i.now.getHours();
  const waterPct =
    i.waterTargetMl > 0 ? Math.min(100, Math.round((i.waterMl / i.waterTargetMl) * 100)) : null;
  const proteinPct =
    i.proteinTargetG > 0 ? Math.min(100, Math.round((i.proteinG / i.proteinTargetG) * 100)) : null;

  // 1. Daily check-in first — it feeds everything else.
  if (!i.checkinDone) {
    return {
      id: "checkin",
      emoji: "📅",
      title: "השלם את הצ׳ק-אין היומי",
      subtitle: "דקה אחת — ומכאן Viora מכירה את היום שלך",
      ctaLabel: "התחל צ׳ק-אין",
      to: "/journal",
      progress: null,
    };
  }

  // 2. Recovery takes precedence when the body signals stress.
  if ((i.painLevel != null && i.painLevel >= 6) || (i.lastSleepHours != null && i.lastSleepHours < 5.5)) {
    return {
      id: "recovery",
      emoji: "😴",
      title: "היום מתמקדים בהתאוששות",
      subtitle:
        i.painLevel != null && i.painLevel >= 6
          ? `רמת כאב ${i.painLevel}/10 — עדיף עומס קל`
          : `ישנת ${i.lastSleepHours?.toFixed(1)} שעות בלבד`,
      ctaLabel: "פתח מרכז בריאות",
      to: "/health",
      progress: null,
    };
  }

  // 3. Planned workout not done yet.
  if (i.hasPlannedWorkout && !i.workoutDoneToday) {
    return {
      id: "workout",
      emoji: "▶",
      title: "האימון של היום מחכה",
      subtitle: "כל מה שצריך מוכן — בוא נתחיל",
      ctaLabel: "התחל אימון",
      to: "/workouts",
      progress: null,
    };
  }

  // 4. Hydration gap that matters at this hour.
  if (waterPct != null && waterPct < 70 && hour >= 10) {
    return {
      id: "water",
      emoji: "💧",
      title: "הגיע הזמן לשתות מים",
      subtitle: `${waterPct}% מיעד השתייה — נותרו ${(
        Math.max(0, i.waterTargetMl - i.waterMl) / 1000
      ).toFixed(1)}L`,
      ctaLabel: "הוסף שתייה",
      to: "/hydration",
      progress: waterPct,
    };
  }

  // 5. Nutrition gap.
  if ((i.mealsCount === 0 && hour >= 10) || (proteinPct != null && proteinPct < 60 && hour >= 14)) {
    return {
      id: "meal",
      emoji: "🥗",
      title: i.mealsCount === 0 ? "עדיין לא תועדה ארוחה" : "חסר לך חלבון להיום",
      subtitle:
        proteinPct != null
          ? `${proteinPct}% מיעד החלבון — נותרו ${Math.max(
              0,
              Math.round(i.proteinTargetG - i.proteinG),
            )}g`
          : "תיעוד מהיר בצילום אחד",
      ctaLabel: "תעד ארוחה",
      to: "/capture",
      progress: proteinPct,
    };
  }

  // 6. Everything on track.
  return {
    id: "rest",
    emoji: "✨",
    title: "היום שלך בכיוון הנכון",
    subtitle: "אין משימה דחופה — שמור על הקצב",
    ctaLabel: "צפה בהתקדמות",
    to: "/progress",
    progress: null,
  };
}

/* ------------------------------------------------------------------ */
/* Weekly progress + streak                                            */
/* ------------------------------------------------------------------ */

export interface WeeklyProgress {
  completed: number;
  goal: number;
  pct: number;
  /** Consecutive weeks (or days) with training activity. */
  streakDays: number;
}

/**
 * @param finishedIsoDates ISO date strings (yyyy-MM-dd) of completed workouts,
 *                         any order, may contain duplicates.
 * @param weekStartIso     ISO date of the current week's first day.
 * @param todayIso         ISO date of today.
 */
export function buildWeeklyProgress(
  finishedIsoDates: string[],
  weekStartIso: string,
  todayIso: string,
  goal: number,
): WeeklyProgress {
  const unique = Array.from(new Set(finishedIsoDates)).sort();
  const completed = unique.filter((d) => d >= weekStartIso && d <= todayIso).length;
  const safeGoal = goal > 0 ? goal : 0;
  const pct = safeGoal > 0 ? Math.min(100, Math.round((completed / safeGoal) * 100)) : 0;

  // Streak = consecutive days ending today/yesterday with a workout.
  const set = new Set(unique);
  let streakDays = 0;
  const cursor = new Date(`${todayIso}T00:00:00`);
  if (!set.has(todayIso)) cursor.setDate(cursor.getDate() - 1);
  for (let guard = 0; guard < 400; guard++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { completed, goal: safeGoal, pct, streakDays };
}
