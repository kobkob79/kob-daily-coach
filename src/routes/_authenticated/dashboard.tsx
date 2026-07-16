import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { MorningIntake, type DayIntake, type DayTargets } from "@/components/dashboard/MorningIntake";
import { getMemory } from "@/lib/ai-memory";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, SHIFT_HOURS, type ShiftConfig } from "@/lib/shift";
import { format, subDays, differenceInYears } from "date-fns";
import { Dumbbell, HeartPulse, CalendarClock, ChevronLeft, BookOpen, Footprints, Flame, Moon, Droplet, Zap, Sparkles, Sun } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { ProgressRing } from "@/components/ui-kit/ProgressRing";
import { biologicalDay } from "@/lib/meals";
import { buildTimeline, buildCoachHints } from "@/lib/timeline";
import { Timeline } from "@/components/dashboard/Timeline";
import { SmartCoach } from "@/components/dashboard/SmartCoach";
import { OneTapBar } from "@/components/dashboard/OneTapBar";
import { useCoachMemory } from "@/lib/coach-memory";
import { buildRecommendations } from "@/lib/intelligence";
import { SmartRecommendations } from "@/components/dashboard/SmartRecommendations";
import { fetchLifeProfile, needsOnboarding } from "@/lib/life-profile";
import { LifeProfileOnboarding } from "@/components/onboarding/LifeProfileOnboarding";
import { useDayContext } from "@/lib/day-context";
import { useHasChronicPain } from "@/lib/daily-engine";

import { getShiftPositionForDate } from "@/lib/shift";
import { AIHeroCard } from "@/components/dashboard/AIHeroCard";
import { LiveStatusBar } from "@/components/dashboard/LiveStatusBar";
import { BodyStatusGrid } from "@/components/dashboard/BodyStatusGrid";
import { DailyAnalysisCard } from "@/components/dashboard/DailyAnalysisCard";
import { TodaysStoryCard } from "@/components/dashboard/TodaysStoryCard";
import {
  AICoachPlaceholderCard,
  BodyScorePlaceholderCard,
} from "@/components/dashboard/HomePlaceholders";
import {
  buildBodyStatus,
  estimateCaloriesBurned,
  useDailyBrief,
  type DailyBriefContext,
} from "@/lib/daily-brief";
import { buildHomeInsight } from "@/lib/home-insight";
import { HomeInsightCards } from "@/components/dashboard/HomeInsightCards";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const PROTEIN_TARGET_G_DEFAULT = 180;
const WATER_TARGET_ML_DEFAULT = 2500;

function Dashboard() {
  const now = new Date();
  const bioDay = biologicalDay(now);
  const todayIso = format(now, "yyyy-MM-dd");
  const yesterdayIso = format(subDays(now, 1), "yyyy-MM-dd");
  const queryClient = useQueryClient();

  const intakeQ = useQuery({
    queryKey: ["day-intake", bioDay],
    queryFn: async () => {
      const intake = await getMemory<DayIntake>(`day_intake:${bioDay}`);
      const targets = await getMemory<DayTargets>(`day_targets:${bioDay}`);
      return { intake, targets };
    },
    staleTime: 60_000,
  });

  const shiftQ = useQuery({
    queryKey: ["shift-config"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_config").select("*").maybeSingle();
      return data as ShiftConfig | null;
    },
  });

  const workoutTodayQ = useQuery({
    queryKey: ["workouts", "today", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id,name,date,duration_min,created_at")
        .eq("date", todayIso);
      return data ?? [];
    },
  });

  const mealsTodayQ = useQuery({
    queryKey: ["meals", bioDay],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_entries")
        .select("id,meal_time,created_at,meal_type,food_name,calories,protein_g,carbs_g,fat_g")
        .eq("biological_day", bioDay);
      // fiber_g exists in the DB (see migration) but may not appear in the
      // generated Supabase types until they refresh. Fetch it via a loose
      // secondary query so the UI can display it without a type error.
      const { data: fibers } = await supabase
        .from("nutrition_entries")
        .select("id, fiber_g" as unknown as "id")
        .eq("biological_day", bioDay);
      const fiberMap = new Map<string, number>();
      for (const row of (fibers ?? []) as Array<{ id: string; fiber_g?: number | null }>) {
        fiberMap.set(row.id, Number(row.fiber_g ?? 0));
      }
      return (data ?? []).map((r) => ({ ...r, fiber_g: fiberMap.get(r.id) ?? 0 }));
    },
  });

  const eventsTodayQ = useQuery({
    queryKey: ["daily-events", bioDay],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("id,kind,event_time,amount,unit,label,emoji")
        .eq("biological_day", bioDay);
      return data ?? [];
    },
  });

  const healthTodayQ = useQuery({
    queryKey: ["health", "today", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_logs")
        .select("id,date,area,pain_level,created_at")
        .eq("date", todayIso);
      return data ?? [];
    },
  });

  const healthRecentQ = useQuery({
    queryKey: ["health", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_logs")
        .select("area,pain_level,date")
        .order("date", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "display_name,full_name,birth_date,gender,height_cm,current_weight_kg,target_weight_kg,protein_target_g,water_target_ml,calorie_target,activity_level",
        )
        .maybeSingle();
      return data;
    },
  });

  const workoutYesterdayQ = useQuery({
    queryKey: ["workouts", "yesterday", yesterdayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("duration_min")
        .eq("date", yesterdayIso);
      return data ?? [];
    },
  });

  const sleepRecentQ = useQuery({
    queryKey: ["sleep", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("amount,event_time")
        .eq("kind", "sleep")
        .order("event_time", { ascending: false })
        .limit(7);
      return data ?? [];
    },
  });

  const waterYesterdayQ = useQuery({
    queryKey: ["daily-events", "yesterday-water", yesterdayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("amount")
        .eq("kind", "water")
        .eq("biological_day", yesterdayIso);
      return data ?? [];
    },
  });


  const PROTEIN_TARGET_G = profileQ.data?.protein_target_g ?? PROTEIN_TARGET_G_DEFAULT;
  const WATER_TARGET_ML = profileQ.data?.water_target_ml ?? WATER_TARGET_ML_DEFAULT;

  const meals = mealsTodayQ.data ?? [];
  const protein = meals.reduce((s, r) => s + Number(r.protein_g ?? 0), 0);
  const proteinPct = protein / PROTEIN_TARGET_G;
  const caloriesEaten = meals.reduce((s, r) => s + Number(r.calories ?? 0), 0);
  const carbs_g = meals.reduce((s, r) => s + Number(r.carbs_g ?? 0), 0);
  const fat_g = meals.reduce((s, r) => s + Number(r.fat_g ?? 0), 0);
  const fiber_g = meals.reduce((s, r) => s + Number(r.fiber_g ?? 0), 0);

  const events = eventsTodayQ.data ?? [];
  const waterEvents = events.filter((e) => e.kind === "water");
  const waterMl = waterEvents.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const lastWaterAt =
    waterEvents.length > 0
      ? new Date(Math.max(...waterEvents.map((e) => new Date(e.event_time).getTime())))
      : null;
  const supplementsToday = events
    .filter((e) => e.kind === "supplement" && e.label)
    .map((e) => String(e.label));

  const lastMealAt = (() => {
    const times = meals
      .map((m) => (m.meal_time ? new Date(`${bioDay}T${m.meal_time}`) : new Date(m.created_at)))
      .map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  })();

  const timelineItems = buildTimeline({
    bioDay,
    meals,
    workouts: workoutTodayQ.data ?? [],
    health: healthTodayQ.data ?? [],
    events,
  });

  const coachMemory = useCoachMemory(bioDay);

  const hints = buildCoachHints({
    now,
    proteinToday: protein,
    proteinTarget: PROTEIN_TARGET_G,
    waterMlToday: waterMl,
    waterTargetMl: WATER_TARGET_ML,
    lastWaterAt,
    lastMealAt,
    workoutLoggedToday: (workoutTodayQ.data ?? []).length > 0,
    shiftConfig: shiftQ.data ?? null,
    memory: coachMemory ?? undefined,
  });

  const sleepRows = (sleepRecentQ.data ?? []).filter((r) => r.amount != null);
  const lastSleepHours = sleepRows[0] ? Number(sleepRows[0].amount) : null;
  const avgSleepHours =
    sleepRows.length > 0
      ? sleepRows.reduce((s, r) => s + Number(r.amount ?? 0), 0) / sleepRows.length
      : null;

  const workoutYesterdayMinutes = (workoutYesterdayQ.data ?? []).reduce(
    (s, w) => s + Number(w.duration_min ?? 0),
    0,
  );
  const workoutTodayMinutes = (workoutTodayQ.data ?? []).reduce(
    (s, w) => s + Number(w.duration_min ?? 0),
    0,
  );

  const currentPain = (() => {
    const rows = healthTodayQ.data ?? [];
    if (rows.length === 0) return null;
    const top = [...rows].sort(
      (a, b) => Number(b.pain_level ?? 0) - Number(a.pain_level ?? 0),
    )[0];
    return top?.pain_level != null
      ? { area: top.area, level: Number(top.pain_level) }
      : null;
  })();

  const shiftPos = shiftQ.data ? getShiftPositionForDate(shiftQ.data, now) : null;

  const recommendations = buildRecommendations({
    now,
    shift: shiftPos?.shift ?? null,
    indexInPhase: shiftPos?.indexInPhase ?? null,
    proteinToday: protein,
    proteinTarget: PROTEIN_TARGET_G,
    waterMlToday: waterMl,
    waterTargetMl: WATER_TARGET_ML,
    lastMealAt,
    lastMealName: meals.find((m) => m.food_name)?.food_name ?? null,
    lastWaterAt,
    workoutLoggedToday: (workoutTodayQ.data ?? []).length > 0,
    workoutYesterdayMinutes,
    currentPain,
    lastSleepHours,
    avgSleepHours,
    weightDelta30dKg: coachMemory?.weightTrend30d?.deltaKg ?? null,
    memory: coachMemory ?? null,
  });

  const shift = shiftQ.data ? getShiftForDate(shiftQ.data, now) : null;
  const shiftStyle = shift ? SHIFT_STYLES[shift] : null;
  const rawDisplay = profileQ.data?.display_name?.trim() ?? "";
  const looksLikeHandle = /[@._]/.test(rawDisplay);
  const displayName =
    profileQ.data?.full_name?.trim() || (looksLikeHandle ? "" : rawDisplay) || "";

  const primaryWorkout = workoutTodayQ.data?.[0];

  // ---- Daily Brief context ----
  const age = profileQ.data?.birth_date
    ? differenceInYears(now, new Date(profileQ.data.birth_date))
    : null;
  const caloriesBurned = estimateCaloriesBurned({
    weightKg: profileQ.data?.current_weight_kg ?? null,
    heightCm: profileQ.data?.height_cm ?? null,
    age,
    gender: (profileQ.data?.gender as "male" | "female" | "other" | null) ?? null,
    activity:
      (profileQ.data?.activity_level as
        | "sedentary" | "light" | "moderate" | "active" | "very_active" | null) ?? null,
    shift: shift ?? null,
    workoutMinutes: workoutTodayMinutes,
  });

  const goal: "fat_loss" | "maintenance" | "muscle_gain" | null = (() => {
    const cur = profileQ.data?.current_weight_kg;
    const tgt = profileQ.data?.target_weight_kg;
    if (cur == null || tgt == null) return null;
    if (tgt < cur - 1) return "fat_loss";
    if (tgt > cur + 1) return "muscle_gain";
    return "maintenance";
  })();

  const dataReady =
    !mealsTodayQ.isLoading &&
    !eventsTodayQ.isLoading &&
    !workoutTodayQ.isLoading &&
    !profileQ.isLoading;

  const briefCtx: DailyBriefContext | null = useMemo(() => {
    if (!dataReady) return null;
    const proteinTarget = PROTEIN_TARGET_G;
    const waterTargetMl = WATER_TARGET_ML;
    const recoveryPct = Math.min(
      100,
      Math.round(
        ((lastSleepHours ?? 6) / 8) * 55 +
          (proteinTarget > 0 ? Math.min(1, protein / proteinTarget) * 45 : 0),
      ),
    );
    const hydrationPct = waterTargetMl > 0 ? Math.round((waterMl / waterTargetMl) * 100) : 0;
    const energyPct = Math.round(
      ((lastSleepHours ?? 6) / 8) * 50 + hydrationPct * 0.3 + Math.min(100, proteinPct * 100) * 0.2,
    );
    const healthScore = Math.round(
      recoveryPct * 0.35 + hydrationPct * 0.25 + energyPct * 0.25 + Math.min(100, proteinPct * 100) * 0.15,
    );
    return {
      now: now.toISOString(),
      displayName,
      shift: shift ?? null,
      proteinToday: Math.round(protein),
      proteinTarget,
      caloriesEaten: Math.round(caloriesEaten),
      caloriesBurned,
      calorieTarget: profileQ.data?.calorie_target ?? null,
      carbs_g: Math.round(carbs_g),
      fat_g: Math.round(fat_g),
      fiber_g: Math.round(fiber_g),
      waterMlToday: waterMl,
      waterTargetMl,
      workoutTodayMinutes,
      workoutYesterdayMinutes,
      lastSleepHours,
      avgSleepHours,
      currentWeightKg: profileQ.data?.current_weight_kg ?? null,
      weightDelta30dKg: coachMemory?.weightTrend30d?.deltaKg ?? null,
      pain: currentPain,
      supplementsToday,
      supplementsHabitual: coachMemory?.supplementsMissingToday?.map((s) => s.name) ?? [],
      meals: meals.map((m) => ({
        name: m.food_name ?? "ארוחה",
        protein_g: Math.round(Number(m.protein_g ?? 0)),
        calories: Math.round(Number(m.calories ?? 0)),
      })),
      goal,
      recoveryPct,
      hydrationPct,
      energyPct,
      healthScore,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataReady,
    protein,
    caloriesEaten,
    caloriesBurned,
    carbs_g,
    fat_g,
    fiber_g,
    waterMl,
    workoutTodayMinutes,
    workoutYesterdayMinutes,
    lastSleepHours,
    avgSleepHours,
    supplementsToday.join(","),
    meals.length,
    shift,
    displayName,
    goal,
  ]);

  const briefQ = useDailyBrief(briefCtx);
  const bodyCards = briefCtx ? buildBodyStatus(briefCtx) : [];
  const proteinLeftG = Math.max(0, Math.round(PROTEIN_TARGET_G - protein));
  const waterLeftMl = Math.max(0, WATER_TARGET_ML - waterMl);
  const calorieNet = Math.round(caloriesEaten - caloriesBurned);
  const briefErrorMessage =
    briefQ.error && briefQ.error instanceof Error ? briefQ.error.message : undefined;

  const targets = intakeQ.data?.targets;
  const showIntake = intakeQ.isSuccess && !intakeQ.data?.intake;

  const lifeQ = useQuery({
    queryKey: ["life-profile"],
    queryFn: fetchLifeProfile,
  });
  const showOnboarding = lifeQ.isSuccess && needsOnboarding(lifeQ.data);
  const dayCtxQ = useDayContext(now);
  const chronicPainQ = useHasChronicPain();

  // ---- Home Insight (Sprint 4 — AI Home Experience) ----
  const waterYesterdayMl = (waterYesterdayQ.data ?? []).reduce(
    (s, e) => s + Number(e.amount ?? 0),
    0,
  );
  const waterYesterdayPct =
    waterYesterdayQ.isSuccess && WATER_TARGET_ML > 0
      ? (waterYesterdayMl / WATER_TARGET_ML) * 100
      : null;
  const homeInsight = useMemo(
    () =>
      buildHomeInsight({
        now,
        displayName: lifeQ.data?.first_name?.trim() || displayName,
        dayContext: dayCtxQ.data ?? null,
        shift,
        cycleDay: shiftPos?.indexInPhase ?? null,
        lastSleepHours,
        avgSleepHours,
        proteinToday: protein,
        proteinTarget: PROTEIN_TARGET_G,
        waterMlToday: waterMl,
        waterTargetMl: WATER_TARGET_ML,
        waterYesterdayPct,
        workoutTodayMinutes,
        plannedWorkoutToday: intakeQ.data?.intake?.plannedWorkout ?? null,
        stepsToday: null,
        stepsTarget: intakeQ.data?.targets?.steps ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dayCtxQ.data,
      shift,
      shiftPos?.indexInPhase,
      lastSleepHours,
      avgSleepHours,
      protein,
      PROTEIN_TARGET_G,
      waterMl,
      WATER_TARGET_ML,
      waterYesterdayPct,
      workoutTodayMinutes,
      intakeQ.data?.intake?.plannedWorkout,
      intakeQ.data?.targets?.steps,
      displayName,
      lifeQ.data?.first_name,
    ],
  );


  const greetingHour = now.getHours();
  const greetingPrefix =
    greetingHour < 5 ? "לילה טוב" :
    greetingHour < 12 ? "בוקר טוב" :
    greetingHour < 17 ? "צהריים טובים" :
    greetingHour < 21 ? "ערב טוב" : "לילה טוב";
  const firstName = (lifeQ.data?.first_name?.trim() || displayName || "").split(" ")[0];

  const aiScore = briefCtx?.healthScore ?? homeInsight.progress?.length
    ? Math.round(
        (homeInsight.progress ?? []).reduce((s, r) => s + Math.min(100, r.pct), 0) /
          Math.max(1, (homeInsight.progress ?? []).length),
      )
    : 0;
  const scoreValue = briefCtx?.healthScore ?? aiScore;
  const ringCircumference = 2 * Math.PI * 88;
  const ringOffset = ringCircumference * (1 - Math.min(100, scoreValue) / 100);

  const proteinPctInt = Math.round(Math.min(100, proteinPct * 100));
  const waterPctInt = WATER_TARGET_ML > 0 ? Math.round(Math.min(100, (waterMl / WATER_TARGET_ML) * 100)) : 0;
  const dateStr = format(now, "EEEE · d MMMM");

  // Dynamic one-line AI insight below the ring
  const dynamicInsight = (() => {
    if (lastSleepHours != null && lastSleepHours >= 7.5) return "הלילה ישנת מצוין 🌙";
    if (lastSleepHours != null && lastSleepHours < 6) return `ישנת רק ${lastSleepHours.toFixed(1)} שעות — קח את זה בקצב היום.`;
    if (waterMl > 0 && waterMl < WATER_TARGET_ML * 0.4 && new Date().getHours() >= 12) return "הגיע הזמן לשתות מים 💧";
    if (protein > 0 && proteinPct < 0.5 && new Date().getHours() >= 15) return `חסרים לך עוד ${Math.max(0, PROTEIN_TARGET_G - Math.round(protein))}g חלבון להיום.`;
    if (workoutTodayMinutes > 0) return `סיימת אימון של ${workoutTodayMinutes} דקות — כל הכבוד 🔥`;
    if (homeInsight.headline) return homeInsight.headline;
    return "בוא נעבור על מה שחשוב היום.";
  })();

  const animatedScore = useCountUp(scoreValue, 1400);

  // Deterministic-ish particle set — 14 green particles floating up behind ring.
  const particles = Array.from({ length: 14 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const rand = (n: number) => ((seed * (n + 1)) % 233280) / 233280;
    return {
      left: `${8 + rand(1) * 84}%`,
      size: 3 + rand(2) * 5,
      dur: `${4.5 + rand(3) * 4}s`,
      delay: `${rand(4) * 5}s`,
      px: `${(rand(5) - 0.5) * 60}px`,
      py: `${-100 - rand(6) * 80}px`,
      opacity: 0.4 + rand(7) * 0.5,
    };
  });


  return (
    <div className="space-y-6 pb-2">
      {showOnboarding && (
        <LifeProfileOnboarding
          initial={lifeQ.data ?? null}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["life-profile"] })}
        />
      )}
      {showIntake && !showOnboarding && (
        <MorningIntake
          bioDay={bioDay}
          context={dayCtxQ.data ?? null}
          hasChronicPain={chronicPainQ.data ?? false}
          firstName={lifeQ.data?.first_name ?? null}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["day-intake", bioDay] });
            queryClient.invalidateQueries({ queryKey: ["daily-engine"] });
          }}
        />
      )}

      {/* Hero — greeting + AI daily score ring with particles */}
      <section className="animate-stagger">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
              {dateStr}
            </p>
            <h1 className="mt-2 text-[32px] font-bold leading-[1.05] tracking-tight">
              {greetingPrefix},
              <br />
              <span className="gradient-text">{firstName || "אורח"}</span>
            </h1>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-card/60 px-3 py-1.5 backdrop-blur-xl">
            <Sun className="h-4 w-4 text-warning" strokeWidth={1.8} />
            <span className="text-[12px] font-semibold tabular-nums">22°</span>
          </div>
        </div>

        <div className="relative mt-6 flex flex-col items-center">
          {/* Particle field */}
          <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 w-64 overflow-visible" aria-hidden>
            {particles.map((p, i) => (
              <span
                key={i}
                className="absolute bottom-4 rounded-full bg-primary shadow-[0_0_10px_2px_oklch(0.93_0.24_125/0.7)] animate-particle"
                style={{
                  left: p.left,
                  width: p.size,
                  height: p.size,
                  opacity: p.opacity,
                  ["--dur" as string]: p.dur,
                  ["--delay" as string]: p.delay,
                  ["--px" as string]: p.px,
                  ["--py" as string]: p.py,
                }}
              />
            ))}
          </div>

          <div className="relative h-56 w-56">
            <div className="absolute inset-2 rounded-full bg-primary/30 animate-breathe" aria-hidden />
            <svg viewBox="0 0 192 192" className="relative h-full w-full -rotate-90">
              <circle cx="96" cy="96" r="88" stroke="oklch(1 0 0 / 6%)" strokeWidth="10" fill="none" />
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="url(#scoreGrad)"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)" }}
                className="drop-shadow-[0_0_14px_oklch(0.93_0.24_125/0.65)]"
              />
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="oklch(0.93 0.24 125)" />
                  <stop offset="100%" stopColor="oklch(0.85 0.20 145)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[64px] font-bold tracking-tighter tabular-nums leading-none">
                {Math.round(animatedScore)}
              </span>
              <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                AI Score
              </span>
            </div>
          </div>

          <p className="mt-5 max-w-[300px] text-center text-[15px] font-medium leading-relaxed text-foreground/85">
            {dynamicInsight}
          </p>
        </div>
      </section>

      {/* Today's priorities */}
      {homeInsight.priorities.length > 0 && (
        <section className="animate-stagger">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-bold tracking-tight">העדיפויות להיום</h2>
            <span className="text-[11px] font-medium text-muted-foreground">
              {homeInsight.priorities.length} משימות
            </span>
          </div>
          <div className="space-y-2.5">
            {homeInsight.priorities.map((p, i) => (
              <div
                key={p.id}
                className="glass-tile flex items-center gap-3 p-3.5 transition-all duration-300"
              >
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                    i === 0 && "bg-primary/15 text-primary",
                    i === 1 && "bg-accent/20 text-accent",
                    i === 2 && "bg-white/10 text-foreground",
                  )}
                >
                  <span className="text-sm font-bold tabular-nums">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold leading-tight">{p.title}</p>
                  {p.hint && (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{p.hint}</p>
                  )}
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground/60 rtl:rotate-180" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Health Snapshot — Steps, Sleep, Heart, Calories */}
      <section className="animate-stagger">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-bold tracking-tight">מבט מהיר</h2>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            חי
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SnapshotTile
            icon={<Footprints className="h-5 w-5" strokeWidth={1.8} />}
            label="צעדים"
            value="—"
            hint="בקרוב"
            accent="lime"
          />
          <SnapshotTile
            icon={<Moon className="h-5 w-5" strokeWidth={1.8} />}
            label="שינה"
            value={lastSleepHours != null ? `${lastSleepHours.toFixed(1)}ש'` : "—"}
            hint={avgSleepHours != null ? `ממוצע ${avgSleepHours.toFixed(1)}ש'` : "אין נתונים"}
            accent="indigo"
          />
          <SnapshotTile
            icon={<HeartPulse className="h-5 w-5" strokeWidth={1.8} />}
            label="דופק"
            value="—"
            hint="חיבור מכשיר"
            accent="rose"
          />
          <SnapshotTile
            icon={<Flame className="h-5 w-5" strokeWidth={1.8} />}
            label="קלוריות"
            value={caloriesEaten > 0 ? Math.round(caloriesEaten).toLocaleString() : "—"}
            hint={caloriesBurned > 0 ? `נשרפו ${Math.round(caloriesBurned)}` : "עדיין לא נאכל"}
            accent="orange"
          />
        </div>

        {/* Water + Protein secondary row (kept from previous functionality) */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SnapshotTile
            icon={<Droplet className="h-5 w-5" strokeWidth={1.8} />}
            label="מים"
            value={waterMl > 0 ? `${(waterMl / 1000).toFixed(1)}L` : "—"}
            hint={`${waterPctInt}% מהיעד`}
            accent="cyan"
            progress={waterPctInt}
          />
          <SnapshotTile
            icon={<Zap className="h-5 w-5" strokeWidth={1.8} />}
            label="חלבון"
            value={protein > 0 ? `${Math.round(protein)}g` : "—"}
            hint={`${proteinPctInt}% מהיעד`}
            accent="lime"
            progress={proteinPctInt}
          />
        </div>
      </section>



      {/* AI Coach shortcut */}
      <Link to="/capture" className="block animate-stagger">
        <div className="glass-card relative flex items-center gap-4 p-5 overflow-hidden">
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/20 blur-2xl" aria-hidden />
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_oklch(0.93_0.24_125/0.55)]">
            <Sparkles className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              AI Coach
            </p>
            <p className="mt-0.5 text-[15px] font-bold leading-tight">המאמן האישי שלך</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              שאל שאלה או צלם ארוחה, מסמך רפואי, תווית תזונה
            </p>
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </div>
      </Link>

      {/* Smart Coach hints */}
      <SmartCoach hints={hints} name={displayName} />

      {/* Personalized recommendations */}
      <SmartRecommendations recommendations={recommendations} />

      {/* Daily Journal */}
      <Link to="/journal">
        <div className="glass-tile flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/20 text-accent">
              <BookOpen className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("home.journal.title")}
              </p>
              <p className="text-[14px] font-semibold">היום · אתמול · ימים קודמים</p>
            </div>
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </div>
      </Link>

      {/* Shift banner */}
      {shift && shiftStyle && (
        <Link to="/shift">
          <div className="glass-tile flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                <CalendarClock className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("shift.today")}
                </p>
                <p className="text-[14px] font-semibold">
                  {shiftStyle.label}
                  <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                    {SHIFT_HOURS[shift]}
                  </span>
                </p>
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
          </div>
        </Link>
      )}

      {/* Timeline */}
      <Timeline items={timelineItems} />

      {/* Today's workout */}
      <section>
        <SectionHeader title={t("home.section.workout")} />
        <Link to="/workouts">
          <PremiumCard interactive>
            {primaryWorkout ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-2xl"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Dumbbell className="h-5 w-5 text-primary-foreground" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="font-semibold">{primaryWorkout.name ?? t("timeline.workout")}</p>
                    <p className="text-xs text-muted-foreground">
                      {primaryWorkout.duration_min ?? "—"} {t("common.minutes")}
                    </p>
                  </div>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
              </div>
            ) : (
              <EmptyState
                icon={<Dumbbell className="h-5 w-5" />}
                title={t("home.workout.none")}
              />
            )}
          </PremiumCard>
        </Link>
      </section>

      {/* Health summary */}
      <section>
        <SectionHeader title={t("home.section.health")} />
        <PremiumCard className="p-0">
          {healthRecentQ.data?.length ? (
            <ul className="divide-y divide-border/60">
              {healthRecentQ.data.map((h, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/50 text-primary">
                      <HeartPulse className="h-4 w-4" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t(`health.area.${h.area}`)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(h.date), "EEE d MMM")}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <b className="text-base text-foreground">{h.pain_level ?? "—"}</b>{" "}
                    {t("common.of10")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon={<HeartPulse className="h-5 w-5" />} title={t("home.health.none")} />
            </div>
          )}
        </PremiumCard>
      </section>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  hint,
  accent,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: "lime" | "indigo" | "cyan" | "orange" | "rose";
  progress?: number;
}) {
  const accentClasses: Record<string, string> = {
    lime: "text-primary bg-primary/12",
    indigo: "text-accent bg-accent/20",
    cyan: "text-sky-300 bg-sky-500/15",
    orange: "text-orange-300 bg-orange-500/15",
    rose: "text-rose-300 bg-rose-500/15",
  };
  const barClasses: Record<string, string> = {
    lime: "bg-primary",
    indigo: "bg-accent",
    cyan: "bg-sky-400",
    orange: "bg-orange-400",
    rose: "bg-rose-400",
  };
  return (
    <div className="glass-tile relative flex flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className={cn("grid h-10 w-10 place-items-center rounded-2xl", accentClasses[accent])}>
          {icon}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div>
        <p className="text-[24px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {typeof progress === "number" && (
        <div className="h-1 overflow-hidden rounded-full bg-white/5">
          <div
            className={cn("h-full rounded-full transition-all duration-700", barClasses[accent])}
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

