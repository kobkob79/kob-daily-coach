/**
 * Viora Daily Engine — the single source of truth for "today".
 *
 * Combines three layers into one clean surface every module (dashboard,
 * AI coach, reminders, nutrition, workouts…) can consume:
 *
 *   1. DayContext  — automatic (date, work status, shift, off, future
 *                    vacation / sick day). Derived from Life Profile via
 *                    `day-context.ts` — no user re-entry required.
 *   2. DailySummary — everything the user actually did today (meals,
 *                     water, workouts, sleep, supplements, mood, pain).
 *                     Aggregated live from Supabase.
 *   3. DailyInsight — the merged object handed to the AI. Persisted to
 *                     `ai_memory` as `day_insight:<bioDay>` so tomorrow's
 *                     coach can reason about yesterday.
 *
 * The Morning Intake writes into layer 1 (context confirmations, mood,
 * planned workout, chronic-pain baseline) — never re-asks anything the
 * Day Context can already answer.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { biologicalDay } from "@/lib/meals";
import { getDayContext, type DayContext, type DayKind } from "@/lib/day-context";
import { fetchLifeProfile, type LifeProfile } from "@/lib/life-profile";
import { getMemory, setMemory } from "@/lib/ai-memory";
import type { DayIntake, DayTargets } from "@/components/dashboard/MorningIntake";

/* ---------- Types ---------- */

export type DayStatus = DayKind | "vacation" | "sick";

/** Snapshot the AI sees. Kept flat and JSON-safe so it survives storage. */
export interface DailySummary {
  bioDay: string;
  meals: {
    count: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    names: string[];
  };
  water_ml: number;
  workouts: { count: number; minutes: number; names: string[] };
  sleep: { hours: number | null; quality: number | null };
  supplements: string[];
  mood: string | null;
  pain: { area: string; level: number } | null;
  work: { status: DayStatus; source: DayContext["source"] };
}

export interface DailyInsight {
  bioDay: string;
  generatedAt: string;
  context: DayContext;
  summary: DailySummary;
  intake: DayIntake | null;
  targets: DayTargets | null;
}

/* ---------- Chronic-pain detection ---------- */

/**
 * Consider a user "chronic-pain aware" if they logged pain ≥3 in the last
 * 30 days at least twice. Purely inferred — no extra profile column
 * required, and it stops the morning intake from asking irrelevant Qs.
 */
export function useHasChronicPain() {
  return useQuery({
    queryKey: ["daily-engine", "chronic-pain"],
    queryFn: async () => {
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const { data } = await supabase
        .from("health_logs")
        .select("pain_level,date")
        .gte("date", since);
      const strong = (data ?? []).filter((r) => Number(r.pain_level ?? 0) >= 3);
      return strong.length >= 2;
    },
    staleTime: 10 * 60_000,
  });
}

/* ---------- Daily Summary ---------- */

export function useDailySummary(now: Date = new Date()) {
  const bioDay = biologicalDay(now);
  const todayIso = format(now, "yyyy-MM-dd");

  const lifeQ = useQuery({ queryKey: ["life-profile"], queryFn: fetchLifeProfile });
  const mealsQ = useQuery({
    queryKey: ["daily-engine", "meals", bioDay],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_entries")
        .select("food_name,calories,protein_g,carbs_g,fat_g,fiber_g")
        .eq("biological_day", bioDay);
      return data ?? [];
    },
  });
  const eventsQ = useQuery({
    queryKey: ["daily-engine", "events", bioDay],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("kind,amount,unit,label")
        .eq("biological_day", bioDay);
      return data ?? [];
    },
  });
  const workoutsQ = useQuery({
    queryKey: ["daily-engine", "workouts", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("name,duration_min")
        .eq("date", todayIso);
      return data ?? [];
    },
  });
  const healthQ = useQuery({
    queryKey: ["daily-engine", "health", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_logs")
        .select("area,pain_level")
        .eq("date", todayIso);
      return data ?? [];
    },
  });
  const intakeQ = useQuery({
    queryKey: ["daily-engine", "intake", bioDay],
    queryFn: async () => (await getMemory<DayIntake>(`day_intake:${bioDay}`)) ?? null,
    staleTime: 60_000,
  });
  const targetsQ = useQuery({
    queryKey: ["daily-engine", "targets", bioDay],
    queryFn: async () => (await getMemory<DayTargets>(`day_targets:${bioDay}`)) ?? null,
    staleTime: 60_000,
  });

  const isReady =
    !lifeQ.isLoading &&
    !mealsQ.isLoading &&
    !eventsQ.isLoading &&
    !workoutsQ.isLoading &&
    !healthQ.isLoading;

  const context = useMemo<DayContext>(
    () =>
      getDayContext({
        lifeContext: lifeQ.data?.life_context ?? null,
        shiftCycle: lifeQ.data?.shift_cycle ?? null,
        now,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lifeQ.data?.life_context, lifeQ.data?.shift_cycle?.anchor_date, bioDay],
  );

  const summary = useMemo<DailySummary | null>(() => {
    if (!isReady) return null;
    const meals = mealsQ.data ?? [];
    const events = eventsQ.data ?? [];
    const workouts = workoutsQ.data ?? [];
    const health = healthQ.data ?? [];
    const sleepEvent = events.find((e) => e.kind === "sleep");
    const topPain = [...health].sort(
      (a, b) => Number(b.pain_level ?? 0) - Number(a.pain_level ?? 0),
    )[0];
    return {
      bioDay,
      meals: {
        count: meals.length,
        calories: round(meals.reduce((s, r) => s + Number(r.calories ?? 0), 0)),
        protein_g: round(meals.reduce((s, r) => s + Number(r.protein_g ?? 0), 0)),
        carbs_g: round(meals.reduce((s, r) => s + Number(r.carbs_g ?? 0), 0)),
        fat_g: round(meals.reduce((s, r) => s + Number(r.fat_g ?? 0), 0)),
        fiber_g: round(meals.reduce((s, r) => s + Number(r.fiber_g ?? 0), 0)),
        names: meals.map((m) => m.food_name).filter(Boolean) as string[],
      },
      water_ml: round(
        events.filter((e) => e.kind === "water").reduce((s, e) => s + Number(e.amount ?? 0), 0),
      ),
      workouts: {
        count: workouts.length,
        minutes: round(workouts.reduce((s, w) => s + Number(w.duration_min ?? 0), 0)),
        names: workouts.map((w) => w.name).filter(Boolean) as string[],
      },
      sleep: {
        hours: sleepEvent ? Number(sleepEvent.amount) : intakeQ.data?.sleepHours ?? null,
        quality: intakeQ.data?.sleepQuality ?? null,
      },
      supplements: events
        .filter((e) => e.kind === "supplement" && e.label)
        .map((e) => String(e.label)),
      mood: intakeQ.data?.mood ?? null,
      pain:
        topPain?.pain_level != null
          ? { area: String(topPain.area), level: Number(topPain.pain_level) }
          : null,
      work: {
        status: (intakeQ.data?.dayStatusOverride as DayStatus) ?? (context.kind as DayStatus),
        source: intakeQ.data?.dayStatusOverride ? "override" : context.source,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    bioDay,
    mealsQ.data,
    eventsQ.data,
    workoutsQ.data,
    healthQ.data,
    intakeQ.data,
    context,
  ]);

  const insight = useMemo<DailyInsight | null>(() => {
    if (!summary) return null;
    return {
      bioDay,
      generatedAt: new Date().toISOString(),
      context,
      summary,
      intake: intakeQ.data ?? null,
      targets: targetsQ.data ?? null,
    };
  }, [bioDay, context, summary, intakeQ.data, targetsQ.data]);

  // Persist the insight snapshot as the day evolves — the AI reads it
  // via ai_memory (`day_insight:<bioDay>`) without re-querying every table.
  useEffect(() => {
    if (!insight) return;
    const handle = setTimeout(() => {
      void setMemory(`day_insight:${bioDay}` as never, insight);
      void setMemory(`day_summary:${bioDay}` as never, summary);
    }, 1500);
    return () => clearTimeout(handle);
  }, [insight, summary, bioDay]);

  return {
    isLoading: !isReady,
    bioDay,
    context,
    summary,
    insight,
    lifeProfile: lifeQ.data ?? null,
    intake: intakeQ.data ?? null,
    targets: targetsQ.data ?? null,
  };
}

function round(n: number): number {
  return Math.round(n);
}

/* ---------- Helpers for tomorrow's coach ---------- */

export async function loadYesterdayInsight(now: Date = new Date()): Promise<DailyInsight | null> {
  const y = biologicalDay(subDays(now, 1));
  return (await getMemory<DailyInsight>(`day_insight:${y}` as never)) ?? null;
}

/** True when the Morning Intake should be shown for this bioDay. */
export function shouldPromptMorningIntake(
  intake: DayIntake | null,
  life: LifeProfile | null,
): boolean {
  if (!life || !life.onboarding_completed_at) return false;
  return !intake;
}
