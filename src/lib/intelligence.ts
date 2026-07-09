/**
 * Viora Intelligence Engine.
 *
 * A single, deterministic reasoning layer that consumes context from every
 * module (shift, meals, water, workouts, health, sleep, weight, memory)
 * and emits ranked, explainable recommendations.
 *
 * This is the shared substrate the future Vision, Voice, Medical and
 * Nutrition AIs will all read from — one central intelligence instead of
 * per-feature heuristics. Text is Hebrew; logic is pure and UI-agnostic.
 */
import { differenceInHours, differenceInMinutes } from "date-fns";
import type { ShiftKind } from "@/lib/shift";
import type { CoachMemory } from "@/lib/timeline";
import { t } from "@/lib/i18n";

/* -------------------- Context -------------------- */

export interface IntelContext {
  now: Date;
  shift: ShiftKind | null;
  /** 1-based index within the current phase (Day 1/2, Night 1/2, Off 1..4). */
  indexInPhase: number | null;
  proteinToday: number;
  proteinTarget: number;
  waterMlToday: number;
  waterTargetMl: number;
  lastMealAt: Date | null;
  lastMealName: string | null;
  lastWaterAt: Date | null;
  workoutLoggedToday: boolean;
  workoutYesterdayMinutes: number;
  /** highest pain entry logged in the last 48h. */
  currentPain: { area: string; level: number } | null;
  lastSleepHours: number | null;
  avgSleepHours: number | null;
  weightDelta30dKg: number | null;
  memory: CoachMemory | null;
}

/* -------------------- Output -------------------- */

export type IntelTone = "info" | "warn" | "good";

export interface Recommendation {
  id: string;
  tone: IntelTone;
  icon: string;
  title: string;
  action: string;
  reasons: string[];
  /** Higher wins when we truncate. */
  priority: number;
}

/* -------------------- Helpers -------------------- */

const AREA_HE: Record<string, string> = {
  neck: "צוואר",
  sciatica: "גב תחתון",
  ac_joint: "כתף",
  general: "כללי",
};

function periodOfDay(h: number): "morning" | "day" | "evening" | "night" {
  return h < 5 ? "night" : h < 11 ? "morning" : h < 17 ? "day" : h < 22 ? "evening" : "night";
}

/* -------------------- Engine -------------------- */

export function buildRecommendations(ctx: IntelContext): Recommendation[] {
  const out: Recommendation[] = [];
  const hour = ctx.now.getHours();
  const proteinLeft = Math.max(0, Math.round(ctx.proteinTarget - ctx.proteinToday));
  const proteinPct = ctx.proteinTarget > 0 ? ctx.proteinToday / ctx.proteinTarget : 0;
  const minsSinceMeal = ctx.lastMealAt
    ? differenceInMinutes(ctx.now, ctx.lastMealAt)
    : Number.POSITIVE_INFINITY;
  const hoursSinceWater = ctx.lastWaterAt
    ? differenceInHours(ctx.now, ctx.lastWaterAt)
    : Number.POSITIVE_INFINITY;

  const isNight = ctx.shift === "night";
  const isNight2 = isNight && ctx.indexInPhase === 2;
  const isNight1 = isNight && ctx.indexInPhase === 1;
  const isOff = ctx.shift === "off";
  const isDay = ctx.shift === "day";

  const painHigh = ctx.currentPain && ctx.currentPain.level >= 6;
  const sleptLittle =
    ctx.lastSleepHours != null &&
    ctx.avgSleepHours != null &&
    ctx.lastSleepHours < ctx.avgSleepHours - 1;
  const heavyYesterday = ctx.workoutYesterdayMinutes >= 45;

  /* ---- Rule 1: Recovery over training (multi-signal) ---- */
  if ((isNight2 || sleptLittle) && (painHigh || heavyYesterday)) {
    const reasons: string[] = [];
    if (isNight2) reasons.push("אתה בלילה 2 — עומס מצטבר");
    if (sleptLittle && ctx.lastSleepHours != null && ctx.avgSleepHours != null)
      reasons.push(
        `ישנת ${ctx.lastSleepHours.toFixed(1)} שעות בלבד (ממוצע ${ctx.avgSleepHours.toFixed(1)})`,
      );
    if (painHigh && ctx.currentPain)
      reasons.push(
        `כאב ${AREA_HE[ctx.currentPain.area] ?? ctx.currentPain.area} ברמה ${ctx.currentPain.level}/10`,
      );
    if (heavyYesterday)
      reasons.push(`אימון אתמול נמשך ${ctx.workoutYesterdayMinutes} דק'`);
    out.push({
      id: "recovery-over-training",
      tone: "warn",
      icon: "🧘",
      title: "היום — התאוששות, לא אימון",
      action: "מומלץ מתיחות, הליכה קלה או שחרור מיופסקיאלי במקום אימון כבד.",
      reasons,
      priority: 100,
    });
  }

  /* ---- Rule 2: Fuel for night shift ---- */
  if (isNight && proteinPct < 0.6 && minsSinceMeal >= 180) {
    const reasons: string[] = [
      `אתה על משמרת לילה${ctx.indexInPhase ? ` ${ctx.indexInPhase}` : ""}`,
      `חסרים לך ${proteinLeft} גרם חלבון להיום`,
    ];
    if (ctx.lastMealAt)
      reasons.push(`עברו ${Math.floor(minsSinceMeal / 60)} שעות מהארוחה האחרונה`);
    else reasons.push("עדיין לא רשמת ארוחה");
    out.push({
      id: "night-fuel",
      tone: "warn",
      icon: "🐟",
      title: "זמן ארוחה עשירת חלבון",
      action: "טונה, קוטג' 5% או חביתת 3 ביצים — מהיר, ~30 גרם חלבון.",
      reasons,
      priority: 90,
    });
  }

  /* ---- Rule 3: Pre-night caffeine habit ---- */
  if (isNight1 && hour >= 16 && hour <= 20) {
    out.push({
      id: "pre-night-coffee",
      tone: "info",
      icon: "☕",
      title: "קפה לפני משמרת הלילה",
      action: "אם זו הקפיצה הראשונה לילה — קפה או קפה חלבון עכשיו יעזור להישאר ערני.",
      reasons: ["מחר לילה 1 — יום הכנה לעירנות", "לפי הדפוס שלך אתה שותה קפה לפני לילה"],
      priority: 60,
    });
  }

  /* ---- Rule 4: Off day 2 — training window ---- */
  if (isOff && ctx.indexInPhase === 2 && !ctx.workoutLoggedToday && hour >= 8 && hour <= 20) {
    out.push({
      id: "off2-workout",
      tone: "info",
      icon: "🏋",
      title: "חלון אימון אידאלי",
      action: "חופש יום 2 — הגוף התאושש. זה היום שאתה בדרך כלל מתאמן בו.",
      reasons: [
        "אתה בחופש יום 2",
        "לרוב אתה מתאמן ביום הזה במחזור",
        !heavyYesterday ? "לא היה אימון כבד אתמול" : "",
      ].filter(Boolean),
      priority: 55,
    });
  }

  /* ---- Rule 5: Hydration debt ---- */
  if (hoursSinceWater >= 3 && hour >= 8) {
    const reasons: string[] = [];
    if (Number.isFinite(hoursSinceWater))
      reasons.push(`עברו ${Math.floor(hoursSinceWater)} שעות מלגימה אחרונה`);
    else reasons.push("לא רשמת מים היום");
    if (isNight) reasons.push("במשמרת לילה יש נטייה להתייבש");
    reasons.push(`יעד יומי: ${ctx.waterTargetMl} מ״ל (עכשיו ${ctx.waterMlToday})`);
    out.push({
      id: "hydrate",
      tone: "warn",
      icon: "💧",
      title: "כוס מים עכשיו",
      action: "לגימה של 500 מ״ל תסגור את הפער.",
      reasons,
      priority: 70,
    });
  }

  /* ---- Rule 6: Protein close-out ---- */
  if (proteinPct >= 0.7 && proteinPct < 1 && hour >= 18) {
    out.push({
      id: "protein-close",
      tone: "good",
      icon: "🎯",
      title: `עוד ${proteinLeft} גרם וסגרת את היעד`,
      action: "שייק חלבון או קוטג' לפני שינה יסגור את היום.",
      reasons: [
        `הגעת ל־${Math.round(proteinPct * 100)}% מיעד החלבון`,
        `נשארו ${proteinLeft} גרם מתוך ${ctx.proteinTarget}`,
      ],
      priority: 40,
    });
  }

  /* ---- Rule 7: Missing habitual supplement ---- */
  for (const s of ctx.memory?.supplementsMissingToday ?? []) {
    out.push({
      id: `supplement-${s.name}`,
      tone: "info",
      icon: "💊",
      title: `לקחת ${s.name}?`,
      action: `עוד לא רשמת ${s.name} היום — לחיצה אחת מהמסך הראשי.`,
      reasons: [
        `${s.name} מופיע ברגילות שלך ב־30 הימים האחרונים`,
        "היום עדיין לא נרשם",
      ],
      priority: 50,
    });
  }

  /* ---- Rule 8: Meal habit reminder ---- */
  if (ctx.memory?.mealHabitHint && minsSinceMeal >= 120) {
    const p = periodOfDay(hour);
    const habitHour = Number(ctx.memory.mealHabitHint.time.slice(0, 2));
    const habitP = periodOfDay(habitHour);
    if (p === habitP) {
      out.push({
        id: "habit-meal",
        tone: "info",
        icon: "🍽",
        title: `זמן ה${ctx.memory.mealHabitHint.food} שלך`,
        action: `בסביבות ${ctx.memory.mealHabitHint.time} אתה בדרך כלל אוכל ${ctx.memory.mealHabitHint.food}.`,
        reasons: [
          `דפוס נלמד: ${ctx.memory.mealHabitHint.food} בסביבות ${ctx.memory.mealHabitHint.time}`,
          minsSinceMeal < 9999
            ? `עברו ${Math.floor(minsSinceMeal / 60)} שעות מהארוחה האחרונה`
            : "עדיין לא אכלת בחלק היום הזה",
        ],
        priority: 35,
      });
    }
  }

  /* ---- Rule 9: Weight trend nudge ---- */
  if (ctx.weightDelta30dKg != null && Math.abs(ctx.weightDelta30dKg) >= 1) {
    const down = ctx.weightDelta30dKg < 0;
    out.push({
      id: "weight-trend",
      tone: down ? "good" : "info",
      icon: down ? "📉" : "📈",
      title: down ? "מגמת ירידה יפה" : "עלייה במשקל ב־30 יום",
      action: down
        ? "המשך אותו קצב — חלבון גבוה + הליכה יומית."
        : "בדוק אם הקלוריות עלו או שהאימון ירד בתדירות.",
      reasons: [
        `שינוי של ${ctx.weightDelta30dKg.toFixed(1)} ק״ג ב־30 יום האחרונים`,
      ],
      priority: 25,
    });
  }

  /* ---- Rule 10: Rising pain trend ---- */
  if (ctx.memory?.painTrendUp) {
    const area = AREA_HE[ctx.memory.painTrendUp.area] ?? ctx.memory.painTrendUp.area;
    out.push({
      id: `pain-trend-${ctx.memory.painTrendUp.area}`,
      tone: "warn",
      icon: "❤️",
      title: `כאב ה${area} עולה`,
      action: "כדאי לשקול יום התאוששות ותרגילי שחרור ממוקדים לאזור.",
      reasons: [
        `3 הרישומים האחרונים באזור ${area} עולים בהתמדה`,
        "מומלץ להימנע מעומס גבוה על האזור",
      ],
      priority: 65,
    });
  }

  // Dedup by id, sort by priority desc, cap at 5.
  const seen = new Set<string>();
  return out
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}

/* -------------------- i18n glue (kept optional) -------------------- */
// Exported so future surfaces can label the section without importing i18n.
export const INTEL_SECTION_TITLE = () => t("intel.section.title");
export const INTEL_SECTION_SUBTITLE = () => t("intel.section.subtitle");
export const INTEL_WHY = () => t("intel.why");
export const INTEL_EMPTY = () => t("intel.empty");
