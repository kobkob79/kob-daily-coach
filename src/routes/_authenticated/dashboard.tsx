import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MorningIntake,
  type DayIntake,
  type DayTargets,
} from "@/components/dashboard/MorningIntake";
import { getMemory } from "@/lib/ai-memory";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, SHIFT_HOURS, type ShiftConfig } from "@/lib/shift";
import { format, subDays, differenceInYears, startOfWeek } from "date-fns";
import {
  Dumbbell,
  CalendarClock,
  ChevronLeft,
  Droplet,
  Utensils,
  HeartPulse,
  History,
  Sparkles,
  CalendarDays,
  Camera,
  BookOpen,
  TrendingUp,
  Clock,
  Flame,
} from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

import { cn } from "@/lib/utils";
import { biologicalDay } from "@/lib/meals";
import { buildTimeline } from "@/lib/timeline";
import { Timeline } from "@/components/dashboard/Timeline";
import { useCoachMemory } from "@/lib/coach-memory";
import { buildRecommendations } from "@/lib/intelligence";
import { SmartRecommendations } from "@/components/dashboard/SmartRecommendations";
import { fetchLifeProfile, needsOnboarding } from "@/lib/life-profile";
import { LifeProfileOnboarding } from "@/components/onboarding/LifeProfileOnboarding";
import { useDayContext } from "@/lib/day-context";
import { useHasChronicPain } from "@/lib/daily-engine";

import { getShiftPositionForDate } from "@/lib/shift";
import { estimateCaloriesBurned, useDailyBrief, type DailyBriefContext } from "@/lib/daily-brief";
import { buildHomeInsight } from "@/lib/home-insight";
import { buildAdaptiveGreeting, buildTodaysFocus, buildWeeklyProgress } from "@/lib/command-center";
import { buildCoachMessage, buildQuickActions, type QuickAction } from "@/lib/home-coach";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeCardStack, HomeCard, HomeStat } from "@/components/home/HomeCardStack";

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

  // Completed workout sessions of the last 60 days — powers weekly progress
  // and the streak counter in the Command Center.
  const sessionsRecentQ = useQuery({
    queryKey: ["workout-sessions", "recent-completed"],
    queryFn: async () => {
      const since = format(subDays(new Date(), 60), "yyyy-MM-dd");
      const { data } = await supabase
        .from("workout_sessions")
        .select("id,name,status,finished_at,duration_seconds,total_volume_kg")
        .eq("status", "completed")
        .gte("finished_at", `${since}T00:00:00Z`)
        .order("finished_at", { ascending: false });
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
    const top = [...rows].sort((a, b) => Number(b.pain_level ?? 0) - Number(a.pain_level ?? 0))[0];
    return top?.pain_level != null ? { area: top.area, level: Number(top.pain_level) } : null;
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
  const displayName = profileQ.data?.full_name?.trim() || (looksLikeHandle ? "" : rawDisplay) || "";

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
        | "sedentary"
        | "light"
        | "moderate"
        | "active"
        | "very_active"
        | null) ?? null,
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
      recoveryPct * 0.35 +
        hydrationPct * 0.25 +
        energyPct * 0.25 +
        Math.min(100, proteinPct * 100) * 0.15,
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
  const proteinLeftG = Math.max(0, Math.round(PROTEIN_TARGET_G - protein));
  const waterLeftMl = Math.max(0, WATER_TARGET_ML - waterMl);
  const calorieNet = Math.round(caloriesEaten - caloriesBurned);

  const targets = intakeQ.data?.targets;
  const showIntake = intakeQ.isSuccess && !intakeQ.data?.intake;

  const lifeQ = useQuery({
    queryKey: ["life-profile"],
    queryFn: fetchLifeProfile,
  });
  // Local latch: once the wizard reports a successful completion write we
  // dismiss immediately, without depending on the refetch result.
  const [onboardingDone, setOnboardingDone] = useState(false);
  const showOnboarding = !onboardingDone && lifeQ.isSuccess && needsOnboarding(lifeQ.data);

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
  const firstName = (lifeQ.data?.first_name?.trim() || displayName || "").split(" ")[0];

  // ---- AI Score (0–100) ----
  // Prefer the explicit healthScore from the daily brief when data is
  // ready; fall back to the average of the home-insight progress rings
  // (which are themselves clamped 0–100). If neither has data yet we
  // return null so the UI can show "עדיין לומדת אותך" instead of a
  // misleading zero.
  const progressPcts = (homeInsight.progress ?? []).map((r) => Math.min(100, Math.max(0, r.pct)));
  const insightAvg =
    progressPcts.length > 0
      ? Math.round(progressPcts.reduce((s, v) => s + v, 0) / progressPcts.length)
      : null;
  const rawScore = briefCtx?.healthScore ?? insightAvg;
  const hasEnoughData = rawScore != null && progressPcts.length > 0;
  const scoreValue = hasEnoughData ? Math.min(100, Math.max(0, Math.round(rawScore))) : 0;
  const ringCircumference = 2 * Math.PI * 88;
  const ringOffset = ringCircumference * (1 - scoreValue / 100);

  const waterPctInt =
    WATER_TARGET_ML > 0 ? Math.round(Math.min(100, (waterMl / WATER_TARGET_ML) * 100)) : 0;
  const dateStr = format(now, "EEEE · d MMMM");

  const animatedScore = useCountUp(scoreValue, 1400);

  /* ---------- Command Center (VIORA-HOME-001) ---------- */
  const plannedWorkoutToday = intakeQ.data?.intake?.plannedWorkout ?? false;
  const workoutDoneToday = workoutTodayMinutes > 0 || (workoutTodayQ.data ?? []).length > 0;

  const adaptiveGreeting = buildAdaptiveGreeting({
    now,
    firstName: firstName,
    dayContext: dayCtxQ.data ?? null,
    shift,
    hasPlannedWorkout: plannedWorkoutToday,
    workoutDoneToday,
  });

  const todaysFocus = buildTodaysFocus({
    now,
    checkinDone: !!intakeQ.data?.intake,
    hasPlannedWorkout: plannedWorkoutToday,
    workoutDoneToday,
    waterMl,
    waterTargetMl: WATER_TARGET_ML,
    proteinG: protein,
    proteinTargetG: PROTEIN_TARGET_G,
    mealsCount: meals.length,
    lastSleepHours,
    painLevel: currentPain?.level ?? null,
  });

  const completedSessions = sessionsRecentQ.data ?? [];
  const completedDates = completedSessions
    .filter((s) => s.finished_at)
    .map((s) => format(new Date(s.finished_at as string), "yyyy-MM-dd"));
  const weekStartIso = format(startOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd");
  const weeklyProgress = buildWeeklyProgress(completedDates, weekStartIso, todayIso, 4);

  const lastSession = completedSessions[0] ?? null;
  const recoveryPct = briefCtx?.recoveryPct ?? null;

  /* ---------- One coach voice (rule 12: no metric dumps) ---------- */
  const coachMessage = buildCoachMessage({
    now,
    firstName,
    shift,
    checkinDone: !!intakeQ.data?.intake,
    score: hasEnoughData ? scoreValue : null,
    lastSleepHours,
    avgSleepHours,
    waterPct: waterPctInt,
    proteinPct: PROTEIN_TARGET_G > 0 ? Math.round(proteinPct * 100) : null,
    workoutDoneToday,
    plannedWorkoutToday,
    painLevel: currentPain?.level ?? null,
    mealsCount: meals.length,
    streakDays: weeklyProgress.streakDays,
  });

  /** AI brief wins when it is ready; the deterministic voice is the fallback. */
  const coachLines = briefQ.data?.hero
    ? [briefQ.data.hero, briefQ.data.statusLine].filter(Boolean)
    : coachMessage.lines;

  const quickActions = buildQuickActions({
    now,
    focusId: todaysFocus.id,
    shift,
    workoutDoneToday,
    plannedWorkoutToday,
    waterPct: waterPctInt,
    proteinPct: PROTEIN_TARGET_G > 0 ? Math.round(proteinPct * 100) : null,
    mealsCount: meals.length,
    painLevel: currentPain?.level ?? null,
  });

  const QUICK_ICONS: Record<QuickAction["icon"], typeof Dumbbell> = {
    dumbbell: Dumbbell,
    calendar: CalendarDays,
    camera: Camera,
    droplet: Droplet,
    heart: HeartPulse,
    book: BookOpen,
    trending: TrendingUp,
    utensils: Utensils,
    clock: Clock,
  };

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
          onComplete={() => {
            setOnboardingDone(true);
            queryClient.invalidateQueries({ queryKey: ["life-profile"] });
          }}
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
              {adaptiveGreeting.timeOfDay},
              <br />
              <span className="gradient-text">{adaptiveGreeting.name}</span>
            </h1>
            {adaptiveGreeting.context && (
              <span className="mt-3 inline-flex items-center rounded-full bg-white/6 px-3 py-1 text-[11px] font-semibold text-foreground/80">
                {adaptiveGreeting.context}
              </span>
            )}
          </div>
          {/* Weather chip hidden until a real weather integration is connected. */}
        </div>

        <div className="relative mt-6 flex flex-col items-center">
          {/* Particle field */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 w-64 overflow-visible"
            aria-hidden
          >
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
            <div
              className="absolute inset-2 rounded-full bg-primary/30 animate-breathe"
              aria-hidden
            />
            <svg viewBox="0 0 192 192" className="relative h-full w-full -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="oklch(1 0 0 / 6%)"
                strokeWidth="10"
                fill="none"
              />
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
              {hasEnoughData ? (
                <>
                  <span className="text-[64px] font-bold tracking-tighter tabular-nums leading-none">
                    {Math.round(animatedScore)}
                  </span>
                  <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    AI Score
                  </span>
                </>
              ) : (
                <span className="max-w-[140px] text-center text-[13px] font-semibold leading-snug text-muted-foreground">
                  עדיין לומדת אותך
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 max-w-[320px] space-y-1.5 text-center">
            {coachLines.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "text-[15px] leading-relaxed",
                  i === 0 ? "font-semibold text-foreground/90" : "text-muted-foreground",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      <HomeHero focus={todaysFocus} />

      {/* Context-aware quick actions */}
      <section className="animate-stagger">
        <div className="grid grid-cols-4 gap-2.5">
          {quickActions.map((a) => {
            const Icon = QUICK_ICONS[a.icon];
            return (
              <Link key={a.id} to={a.to as never} className="block">
                <div className="glass-tile flex flex-col items-center gap-2 px-2 py-3.5 transition-all duration-300 active:scale-[0.97]">
                  <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", a.tint)}>
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className="truncate text-[11px] font-semibold">{a.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Category cards — one KPI each, collapsed by default */}
      <HomeCardStack>
        <HomeCard
          id="workouts"
          title="אימונים"
          kpi={`${weeklyProgress.completed}/${weeklyProgress.goal || "—"}`}
          kpiHint="השבוע"
          accent="lime"
          progress={weeklyProgress.pct}
          icon={<Dumbbell className="h-5 w-5" strokeWidth={1.8} />}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <HomeStat label="רצף" value={`${weeklyProgress.streakDays}`} hint="ימים ברצף" />
            <HomeStat
              label="אימון אחרון"
              value={
                lastSession?.finished_at ? format(new Date(lastSession.finished_at), "d MMM") : "—"
              }
              hint={
                lastSession?.duration_seconds
                  ? `${Math.round(Number(lastSession.duration_seconds) / 60)} דקות`
                  : (lastSession?.name ?? "אין נתונים")
              }
            />
          </div>
          <div className="mt-3 rounded-2xl bg-white/4 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">היום</p>
            <p className="mt-1 text-[14px] font-semibold">
              {primaryWorkout?.name ?? (plannedWorkoutToday ? "אימון מתוכנן" : "אין אימון מתוכנן")}
              {primaryWorkout?.duration_min ? (
                <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                  {primaryWorkout.duration_min} דקות
                </span>
              ) : null}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold">
            <Link to="/workouts" className="rounded-full bg-primary/12 px-3 py-1.5 text-primary">
              לאימונים
            </Link>
            <Link to="/workouts/program" className="rounded-full bg-white/6 px-3 py-1.5">
              מתכנן שבועי
            </Link>
            <Link to="/workouts/history" className="rounded-full bg-white/6 px-3 py-1.5">
              היסטוריה
            </Link>
          </div>
        </HomeCard>

        <HomeCard
          id="nutrition"
          title="תזונה"
          kpi={`${Math.round(caloriesEaten)}`}
          kpiHint="קלוריות היום"
          accent="orange"
          icon={<Utensils className="h-5 w-5" strokeWidth={1.8} />}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <HomeStat
              label="חלבון"
              value={`${Math.round(protein)}g`}
              hint={proteinLeftG > 0 ? `עוד ${proteinLeftG}g ליעד` : "היעד הושג"}
            />
            <HomeStat label="פחמימות" value={`${Math.round(carbs_g)}g`} />
            <HomeStat label="שומן" value={`${Math.round(fat_g)}g`} />
            <HomeStat label="סיבים" value={`${Math.round(fiber_g)}g`} />
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            {meals.length} ארוחות · מאזן קלורי {calorieNet > 0 ? "+" : ""}
            {calorieNet}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold">
            <Link
              to="/nutrition"
              className="rounded-full bg-orange-500/15 px-3 py-1.5 text-orange-200"
            >
              מרכז תזונה
            </Link>
            <Link to="/capture" className="rounded-full bg-white/6 px-3 py-1.5">
              צילום ארוחה
            </Link>
          </div>
        </HomeCard>

        <HomeCard
          id="hydration"
          title="שתייה"
          kpi={`${waterPctInt}%`}
          kpiHint="מהיעד היומי"
          accent="cyan"
          progress={waterPctInt}
          icon={<Droplet className="h-5 w-5" strokeWidth={1.8} />}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <HomeStat label="שתית" value={`${(waterMl / 1000).toFixed(1)}L`} />
            <HomeStat
              label="נשאר"
              value={`${(waterLeftMl / 1000).toFixed(1)}L`}
              hint={waterLeftMl === 0 ? "היעד הושג" : undefined}
            />
          </div>
          <div className="mt-3">
            <Link
              to="/hydration"
              className="inline-flex rounded-full bg-sky-500/15 px-3 py-1.5 text-[12px] font-semibold text-sky-200"
            >
              מרכז השתייה
            </Link>
          </div>
        </HomeCard>

        <HomeCard
          id="recovery"
          title="התאוששות"
          kpi={recoveryPct != null ? `${recoveryPct}%` : "—"}
          kpiHint="שינה · כאב · עומס"
          accent="indigo"
          progress={recoveryPct}
          icon={<HeartPulse className="h-5 w-5" strokeWidth={1.8} />}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <HomeStat
              label="שינה"
              value={lastSleepHours != null ? `${lastSleepHours.toFixed(1)}ש׳` : "—"}
              hint={avgSleepHours != null ? `ממוצע ${avgSleepHours.toFixed(1)}ש׳` : undefined}
            />
            <HomeStat
              label="כאב"
              value={currentPain ? `${currentPain.level}/10` : "—"}
              hint={currentPain?.area ?? "לא דווח כאב"}
            />
          </div>
          {healthRecentQ.data?.length ? (
            <ul className="mt-3 space-y-1.5">
              {healthRecentQ.data.slice(0, 3).map((h, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-2xl bg-white/4 px-3 py-2 text-[12px]"
                >
                  <span className="font-medium">{h.area}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(h.date), "d MMM")} · {h.pain_level ?? "—"}/10
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3">
            <Link
              to="/health"
              className="inline-flex rounded-full bg-accent/20 px-3 py-1.5 text-[12px] font-semibold text-accent"
            >
              ספר הבריאות
            </Link>
          </div>
        </HomeCard>

        <HomeCard
          id="day"
          title="היום שלי"
          kpi={shiftStyle?.label ?? "—"}
          kpiHint={shift ? SHIFT_HOURS[shift] : "ללא משמרת"}
          accent="neutral"
          icon={<CalendarClock className="h-5 w-5" strokeWidth={1.8} />}
        >
          <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
            <Link to="/shift" className="rounded-full bg-white/6 px-3 py-1.5">
              לוח המשמרות
            </Link>
            <Link to="/journal" className="rounded-full bg-white/6 px-3 py-1.5">
              יומן יומי
            </Link>
            <Link to="/progress" className="rounded-full bg-white/6 px-3 py-1.5">
              התקדמות
            </Link>
          </div>
        </HomeCard>

        <HomeCard
          id="timeline"
          title="ציר הזמן של היום"
          kpi={`${timelineItems.length}`}
          kpiHint="רשומות היום"
          accent="neutral"
          icon={<History className="h-5 w-5" strokeWidth={1.8} />}
        >
          <Timeline items={timelineItems} bare />
        </HomeCard>

        <HomeCard
          id="insights"
          title="תובנות Viora"
          kpi={`${recommendations.length}`}
          kpiHint="המלצות עם הסבר"
          accent="rose"
          icon={<Sparkles className="h-5 w-5" strokeWidth={1.8} />}
        >
          <SmartRecommendations recommendations={recommendations} bare />
        </HomeCard>
      </HomeCardStack>
    </div>
  );
}
