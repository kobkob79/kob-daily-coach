/**
 * Client-side helpers for the KobiOS Daily Brief.
 *
 * - buildBodyStatus: local, deterministic scoring for the colorful body
 *   cards (recovery, hydration, energy, fat-burn, sleep, general).
 * - estimateCaloriesBurned: BMR + activity + shift + workout.
 * - useDailyBrief: React Query hook that calls the server fn only when the
 *   underlying data actually changes (signature-based cache key), so
 *   every meal/water/workout log triggers a fresh brief automatically.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  generateDailyBrief,
  type DailyBrief,
  type DailyBriefContext,
} from "@/lib/daily-brief.functions";

export interface BodyStatusCard {
  id: string;
  emoji: string;
  title: string;
  color: string; // gradient class
  ring: string;  // ring color class
  value: number; // 0..100
  label: string;
  hint: string;
}

export function buildBodyStatus(ctx: DailyBriefContext): BodyStatusCard[] {
  const proteinPct = ctx.proteinTarget > 0
    ? Math.min(100, Math.round((ctx.proteinToday / ctx.proteinTarget) * 100))
    : 0;

  // Recovery: high if slept well + not overworked yesterday + protein hit
  const sleepScore = ctx.lastSleepHours != null
    ? Math.max(0, Math.min(100, ((ctx.lastSleepHours - 4) / 4) * 100))
    : 60;
  const overwork = ctx.workoutYesterdayMinutes >= 60 && (ctx.lastSleepHours ?? 7) < 6 ? 25 : 0;
  const recovery = Math.max(0, Math.min(100, Math.round(sleepScore * 0.55 + proteinPct * 0.45 - overwork)));

  // Hydration
  const hydration = ctx.waterTargetMl > 0
    ? Math.min(100, Math.round((ctx.waterMlToday / ctx.waterTargetMl) * 100))
    : 0;

  // Energy: sleep + calories vs need + hydration
  const energy = Math.round(sleepScore * 0.5 + hydration * 0.3 + Math.min(100, proteinPct) * 0.2);

  // Fat burn: negative-to-neutral calorie balance boosts score
  const net = ctx.caloriesEaten - ctx.caloriesBurned;
  const fatBurn = Math.max(0, Math.min(100, Math.round(60 - net / 20)));

  // Sleep score
  const sleep = Math.round(sleepScore);

  // General
  const general = Math.round(
    recovery * 0.25 + hydration * 0.2 + energy * 0.2 + sleep * 0.2 + Math.min(100, proteinPct) * 0.15,
  );

  return [
    {
      id: "recovery",
      emoji: "💪",
      title: "התאוששות שרירים",
      color: "from-emerald-400/25 to-teal-500/15",
      ring: "ring-emerald-400/40",
      value: recovery,
      label: `${recovery}%`,
      hint: recovery >= 75 ? "השרירים במצב מצוין" : recovery >= 50 ? "התאוששות בינונית" : "כדאי לנוח היום",
    },
    {
      id: "hydration",
      emoji: "💧",
      title: "הידרציה",
      color: "from-sky-400/25 to-cyan-500/15",
      ring: "ring-sky-400/40",
      value: hydration,
      label: `${hydration}%`,
      hint: hydration >= 90 ? "שתייה מצוינת" : `חסרים ${Math.max(0, ctx.waterTargetMl - ctx.waterMlToday)} מ״ל`,
    },
    {
      id: "energy",
      emoji: "⚡",
      title: "אנרגיה",
      color: "from-amber-400/25 to-orange-500/15",
      ring: "ring-amber-400/40",
      value: energy,
      label: `${energy}%`,
      hint: energy >= 70 ? "אנרגיה גבוהה" : "כדאי להוסיף שינה ומים",
    },
    {
      id: "fatburn",
      emoji: "🔥",
      title: "שריפת שומן",
      color: "from-rose-400/25 to-pink-500/15",
      ring: "ring-rose-400/40",
      value: fatBurn,
      label: net >= 0 ? `+${net}` : `${net}`,
      hint: net < -100 ? "גירעון קלורי בריא" : net < 200 ? "מאזן קרוב לאיזון" : "עודף קלורי היום",
    },
    {
      id: "sleep",
      emoji: "😴",
      title: "התאוששות ושינה",
      color: "from-indigo-400/25 to-violet-500/15",
      ring: "ring-indigo-400/40",
      value: sleep,
      label: ctx.lastSleepHours != null ? `${ctx.lastSleepHours.toFixed(1)}ש׳` : "—",
      hint: ctx.avgSleepHours != null ? `ממוצע: ${ctx.avgSleepHours.toFixed(1)}ש׳` : "רשום שינה כדי לקבל תובנות",
    },
    {
      id: "general",
      emoji: "❤️",
      title: "מצב כללי",
      color: "from-fuchsia-400/25 to-purple-500/15",
      ring: "ring-fuchsia-400/40",
      value: general,
      label: `${general}`,
      hint: general >= 80 ? "יום מצוין!" : general >= 60 ? "יום סביר" : "יום מאתגר — קחו את זה בקלות",
    },
  ];
}

/**
 * Rough calorie burn estimate: Mifflin–St Jeor BMR × activity factor +
 * workout minutes × 7 kcal/min. Missing anthropometrics fall back to a
 * safe average.
 */
export function estimateCaloriesBurned(input: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  activity: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  shift: string | null;
  workoutMinutes: number;
}): number {
  const w = input.weightKg ?? 80;
  const h = input.heightCm ?? 175;
  const a = input.age ?? 35;
  const bmr =
    input.gender === "female"
      ? 10 * w + 6.25 * h - 5 * a - 161
      : 10 * w + 6.25 * h - 5 * a + 5;
  const factor =
    input.activity === "sedentary" ? 1.2
    : input.activity === "light" ? 1.375
    : input.activity === "moderate" ? 1.55
    : input.activity === "active" ? 1.725
    : input.activity === "very_active" ? 1.9
    : 1.45;
  const shiftBoost = input.shift === "night" ? 100 : input.shift === "day" ? 60 : 0;
  const workoutKcal = Math.round(input.workoutMinutes * 7);
  return Math.round(bmr * factor + shiftBoost + workoutKcal);
}

/** Stable signature: only regenerate the AI brief when data actually changes. */
export function briefSignature(ctx: DailyBriefContext): string {
  return [
    ctx.now.slice(0, 10),
    Math.round(ctx.proteinToday),
    Math.round(ctx.caloriesEaten),
    Math.round(ctx.caloriesBurned),
    ctx.waterMlToday,
    ctx.workoutTodayMinutes,
    ctx.workoutYesterdayMinutes,
    ctx.lastSleepHours ?? "",
    ctx.pain ? `${ctx.pain.area}:${ctx.pain.level}` : "",
    ctx.supplementsToday.join(","),
    ctx.meals.length,
    ctx.shift ?? "",
  ].join("|");
}

export function useDailyBrief(ctx: DailyBriefContext | null) {
  const call = useServerFn(generateDailyBrief);
  const sig = ctx ? briefSignature(ctx) : null;
  return useQuery<DailyBrief>({
    queryKey: ["daily-brief", sig],
    enabled: !!ctx,
    // Once generated for a signature, keep it — new logs create a new sig.
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    queryFn: async () => call({ data: ctx! }),
  });
}

export type { DailyBrief, DailyBriefContext };
