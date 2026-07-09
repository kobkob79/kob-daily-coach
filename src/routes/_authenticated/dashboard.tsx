import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { MorningIntake, type DayIntake, type DayTargets } from "@/components/dashboard/MorningIntake";
import { getMemory } from "@/lib/ai-memory";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, SHIFT_HOURS, type ShiftConfig } from "@/lib/shift";
import { format, subDays, differenceInYears } from "date-fns";
import { Dumbbell, HeartPulse, CalendarClock, ChevronLeft, BookOpen } from "lucide-react";
import { t } from "@/lib/i18n";
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

  return (
    <div className="space-y-6 pb-2">
      {showIntake && (
        <MorningIntake
          bioDay={bioDay}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["day-intake", bioDay] })}
        />
      )}
      {/* Header */}
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {format(now, "EEEE · d MMMM")}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{t("home.title")}</h1>
      </section>

      {targets && (targets.recommendations.length > 0 || targets.warnings.length > 0) && (
        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 space-y-2 animate-fade-in">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            היעדים של Viora להיום
          </p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <TargetTile label="מים" value={`${Math.round(targets.water_ml / 100) / 10}L`} />
            <TargetTile label="חלבון" value={`${targets.protein_g}g`} />
            <TargetTile label="צעדים" value={`${(targets.steps / 1000).toFixed(1)}K`} />
            <TargetTile label="פעילות" value={`${targets.activity_min}′`} />
          </div>
          {targets.recommendations.map((r, i) => (
            <p key={`r-${i}`} className="text-sm text-foreground/80">✨ {r}</p>
          ))}
          {targets.warnings.map((w, i) => (
            <p key={`w-${i}`} className="text-sm text-warning">⚠️ {w}</p>
          ))}
        </div>
      )}

      {/* Today's Story */}
      <TodaysStoryCard bioDay={bioDay} />

      {/* AI Coach placeholder */}
      <AICoachPlaceholderCard />

      {/* Body Score placeholder */}
      <BodyScorePlaceholderCard />

      {/* AI Hero — "היום הגוף שלך אומר..." */}
      <AIHeroCard
        brief={briefQ.data}
        isLoading={briefQ.isLoading || briefQ.isFetching}
        isError={briefQ.isError}
        errorMessage={briefErrorMessage}
        onRetry={() => briefQ.refetch()}
        displayName={displayName}
      />

      {/* Live Status Bar */}
      {briefCtx && (
        <LiveStatusBar
          proteinLeftG={proteinLeftG}
          waterLeftMl={waterLeftMl}
          supplementsTodayCount={supplementsToday.length}
          recoveryPct={briefCtx.recoveryPct}
          calorieNet={calorieNet}
          healthScore={briefCtx.healthScore}
          statusLine={briefQ.data?.statusLine}
        />
      )}

      {/* Body Status */}
      {bodyCards.length > 0 && <BodyStatusGrid cards={bodyCards} />}

      {/* AI Daily Analysis */}
      {briefQ.data && <DailyAnalysisCard brief={briefQ.data} />}

      {/* Smart Coach */}
      <SmartCoach hints={hints} name={displayName} />

      {/* Deterministic recommendations */}
      <SmartRecommendations recommendations={recommendations} />

      {/* Water moved to dedicated /hydration page — data still flows into AI brief */}

      {/* Daily Journal — history navigator */}
      <Link to="/journal">
        <PremiumCard interactive className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("home.journal.title")}
              </p>
              <p className="text-base font-semibold">היום · אתמול · ימים קודמים</p>
              <p className="text-[11px] text-muted-foreground">{t("home.journal.hint")}</p>
            </div>
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </PremiumCard>
      </Link>



      {/* Shift banner */}
      {shift && shiftStyle && (
        <Link to="/shift">
          <PremiumCard interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${shiftStyle.className}`}>
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("shift.today")}
                </p>
                <p className="text-base font-semibold">
                  {shiftStyle.label}
                  <span className="ms-2 text-xs font-normal text-muted-foreground">
                    {SHIFT_HOURS[shift]}
                  </span>
                </p>
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
          </PremiumCard>
        </Link>
      )}

      {/* Protein progress */}
      <section>
        <SectionHeader title={t("home.section.protein")} />
        <PremiumCard>
          <div className="flex items-center gap-5">
            <ProgressRing
              value={proteinPct}
              label={`${Math.round(protein)}`}
              sub={t("common.grams")}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {Math.round(protein)} {t("common.grams")} {t("home.protein.of")}{" "}
                <span className="font-semibold text-foreground">{PROTEIN_TARGET_G}</span>{" "}
                {t("common.grams")}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {Math.round(Math.min(1, proteinPct) * 100)}%
              </p>
              <Link
                to="/meals"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                {t("action.logMeal")} <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </PremiumCard>
      </section>

      {/* One-tap quick add */}
      <OneTapBar />

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
                    <Dumbbell className="h-5 w-5 text-primary-foreground" />
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
                      <HeartPulse className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {t(`health.area.${h.area}`)}
                      </p>
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
              <EmptyState
                icon={<HeartPulse className="h-5 w-5" />}
                title={t("home.health.none")}
              />
            </div>
          )}
        </PremiumCard>
      </section>
    </div>
  );
}

function TargetTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
