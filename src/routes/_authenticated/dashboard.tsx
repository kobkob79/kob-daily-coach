import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, SHIFT_HOURS, type ShiftConfig } from "@/lib/shift";
import { format } from "date-fns";
import { Dumbbell, HeartPulse, CalendarClock, ChevronLeft } from "lucide-react";
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
import { subDays } from "date-fns";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// Personal defaults — will move to a user_settings table when profile UI lands.
const PROTEIN_TARGET_G = 180;
const WATER_TARGET_ML = 2500;

function Dashboard() {
  const now = new Date();
  const bioDay = biologicalDay(now);
  const todayIso = format(now, "yyyy-MM-dd");

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
        .select("id,meal_time,created_at,meal_type,food_name,calories,protein_g")
        .eq("biological_day", bioDay);
      return data ?? [];
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
      const { data } = await supabase.from("profiles").select("display_name").maybeSingle();
      return data;
    },
  });

  const protein =
    mealsTodayQ.data?.reduce((s, r) => s + Number(r.protein_g ?? 0), 0) ?? 0;
  const proteinPct = protein / PROTEIN_TARGET_G;

  const waterEvents = (eventsTodayQ.data ?? []).filter((e) => e.kind === "water");
  const waterMl = waterEvents.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const lastWaterAt =
    waterEvents.length > 0
      ? new Date(
          Math.max(...waterEvents.map((e) => new Date(e.event_time).getTime())),
        )
      : null;

  const lastMealAt = (() => {
    const times = (mealsTodayQ.data ?? [])
      .map((m) => (m.meal_time ? new Date(`${bioDay}T${m.meal_time}`) : new Date(m.created_at)))
      .map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  })();

  const timelineItems = buildTimeline({
    bioDay,
    meals: mealsTodayQ.data ?? [],
    workouts: workoutTodayQ.data ?? [],
    health: healthTodayQ.data ?? [],
    events: eventsTodayQ.data ?? [],
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

  // Yesterday's workout minutes — used by the intelligence engine to detect
  // heavy prior day and recommend recovery instead of another session.
  const yesterdayIso = format(subDays(now, 1), "yyyy-MM-dd");
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

  // Last night's sleep + 7-day average, sourced from daily_events.
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
    lastMealName:
      (mealsTodayQ.data ?? []).find((m) => m.food_name)?.food_name ?? null,
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
  const displayName = profileQ.data?.display_name || "קובי";


  const primaryWorkout = workoutTodayQ.data?.[0];

  return (
    <div className="space-y-6 pb-2">
      {/* Header */}
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {format(now, "EEEE · d MMMM")}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{t("home.title")}</h1>
      </section>

      {/* Smart Coach (replaces greeting) */}
      <SmartCoach hints={hints} name={displayName} />

      {/* Central intelligence — cross-module recommendations with explainability */}
      <SmartRecommendations recommendations={recommendations} />


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

      {/* One-tap quick add (favorites + water + supplement/weight/sleep) */}
      <OneTapBar />

      {/* Chronological timeline */}
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
