import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, type ShiftConfig } from "@/lib/shift";
import { format } from "date-fns";
import { Dumbbell, HeartPulse, CalendarClock, Sparkles, ChevronLeft } from "lucide-react";
import { today } from "@/lib/date";
import { t } from "@/lib/i18n";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { ProgressRing } from "@/components/ui-kit/ProgressRing";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// Personal defaults — will move to a user_settings table when profile UI lands.
const PROTEIN_TARGET_G = 180;

function greetingKey() {
  const h = new Date().getHours();
  if (h < 5) return "home.greeting.night";
  if (h < 12) return "home.greeting.morning";
  if (h < 18) return "home.greeting.afternoon";
  return "home.greeting.evening";
}

function Dashboard() {
  const todayIso = today();

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
        .select("id,name,date,duration_min")
        .eq("date", todayIso)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const nutritionTodayQ = useQuery({
    queryKey: ["nutrition", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_entries")
        .select("calories,protein_g")
        .eq("date", todayIso);
      return data ?? [];
    },
  });

  const healthQ = useQuery({
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

  const protein = nutritionTodayQ.data?.reduce((s, r) => s + Number(r.protein_g ?? 0), 0) ?? 0;
  const proteinPct = protein / PROTEIN_TARGET_G;
  const shift = shiftQ.data ? getShiftForDate(shiftQ.data, new Date()) : null;
  const shiftStyle = shift ? SHIFT_STYLES[shift] : null;

  return (
    <div className="space-y-6 pb-2">
      {/* Header */}
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {format(new Date(), "EEEE · d MMMM")}
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
          {t(greetingKey())}, <span className="gradient-text">קובי</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("home.title")}</p>
      </section>

      {/* Shift banner */}
      {shiftStyle && (
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
                <p className="text-base font-semibold">{shiftStyle.label}</p>
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
                to="/nutrition"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                {t("action.logMeal")} <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </PremiumCard>
      </section>

      {/* Today's workout */}
      <section>
        <SectionHeader title={t("home.section.workout")} />
        <Link to="/workouts">
          <PremiumCard interactive>
            {workoutTodayQ.data ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-2xl"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Dumbbell className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">{workoutTodayQ.data.name ?? "Workout"}</p>
                    <p className="text-xs text-muted-foreground">
                      {workoutTodayQ.data.duration_min ?? "—"} {t("common.minutes")}
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
          {healthQ.data?.length ? (
            <ul className="divide-y divide-border/60">
              {healthQ.data.map((h, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/50 text-primary">
                      <HeartPulse className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{h.area.replace("_", " ")}</p>
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

      {/* AI insight placeholder */}
      <section>
        <SectionHeader title={t("home.section.ai")} />
        <PremiumCard className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          />
          <div className="relative flex items-start gap-3">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">KobiOS Coach</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("home.ai.placeholder")}
              </p>
            </div>
          </div>
        </PremiumCard>
      </section>
    </div>
  );
}
