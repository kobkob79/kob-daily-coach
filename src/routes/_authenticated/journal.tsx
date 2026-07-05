/**
 * Daily Journal — every calendar day is an independent journal entry.
 * Navigate today ↔ yesterday ↔ any past day with the calendar picker.
 * Each day shows only that day's meals, water, workouts, supplements,
 * weight, sleep, and health events. Nothing accumulates across days.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { format, addDays, subDays, isValid, parseISO, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronRight,
  ChevronLeft,
  Apple,
  Droplet,
  Dumbbell,
  Pill,
  Scale,
  Moon,
  HeartPulse,
  Calendar as CalendarIcon,
} from "lucide-react";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";

const searchSchema = z.object({
  date: z.string().optional(),
});

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function isValidIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return isValid(d);
}

export const Route = createFileRoute("/_authenticated/journal")({
  validateSearch: zodValidator(searchSchema),
  component: Journal,
});

function Journal() {
  const { date: dateParam } = Route.useSearch();
  const navigate = useNavigate({ from: "/journal" });
  const dateIso = dateParam && isValidIso(dateParam) ? dateParam : todayIso();
  const dateObj = parseISO(dateIso);
  const isFuture = dateObj.getTime() > Date.now();

  const goto = (d: string) =>
    navigate({ search: (prev) => ({ ...prev, date: d }), replace: true });

  const mealsQ = useQuery({
    queryKey: ["journal", "meals", dateIso],
    queryFn: async () => {
      // Use biological_day when available; fall back to date for older rows.
      const { data } = await supabase
        .from("nutrition_entries")
        .select(
          "id,food_name,meal_type,meal_time,calories,protein_g,carbs_g,fat_g,created_at,biological_day,date",
        )
        .or(`biological_day.eq.${dateIso},date.eq.${dateIso}`);
      const { data: fibers } = await supabase
        .from("nutrition_entries")
        .select("id, fiber_g" as unknown as "id")
        .or(`biological_day.eq.${dateIso},date.eq.${dateIso}`);
      const fmap = new Map<string, number>();
      for (const r of (fibers ?? []) as Array<{ id: string; fiber_g?: number | null }>) {
        fmap.set(r.id, Number(r.fiber_g ?? 0));
      }
      return (data ?? []).map((r) => ({ ...r, fiber_g: fmap.get(r.id) ?? 0 }));
    },
  });

  const eventsQ = useQuery({
    queryKey: ["journal", "events", dateIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("id,kind,event_time,amount,unit,label,emoji")
        .or(`biological_day.eq.${dateIso},event_date.eq.${dateIso}`);
      return data ?? [];
    },
  });

  const workoutsQ = useQuery({
    queryKey: ["journal", "workouts", dateIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id,name,date,duration_min,notes")
        .eq("date", dateIso);
      return data ?? [];
    },
  });

  const healthQ = useQuery({
    queryKey: ["journal", "health", dateIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_logs")
        .select("id,area,pain_level,notes")
        .eq("date", dateIso);
      return data ?? [];
    },
  });

  const meals = mealsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const workouts = workoutsQ.data ?? [];
  const health = healthQ.data ?? [];

  const totals = meals.reduce(
    (acc, m) => {
      acc.calories += Number(m.calories ?? 0);
      acc.protein += Number(m.protein_g ?? 0);
      acc.carbs += Number(m.carbs_g ?? 0);
      acc.fat += Number(m.fat_g ?? 0);
      acc.fiber += Number(m.fiber_g ?? 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  const waterEvents = events.filter((e) => e.kind === "water");
  const waterMl = waterEvents.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const supplements = events.filter((e) => e.kind === "supplement");
  const weightEvent = events.find((e) => e.kind === "weight");
  const sleepEvent = events.find((e) => e.kind === "sleep");

  const workoutMinutes = workouts.reduce(
    (s, w) => s + Number(w.duration_min ?? 0),
    0,
  );

  const dayLabel = isToday(dateObj)
    ? "היום"
    : isYesterday(dateObj)
      ? "אתמול"
      : format(dateObj, "EEEE · d MMMM yyyy");

  const isLoading =
    mealsQ.isLoading || eventsQ.isLoading || workoutsQ.isLoading || healthQ.isLoading;

  const hasAny =
    meals.length > 0 ||
    events.length > 0 ||
    workouts.length > 0 ||
    health.length > 0;

  return (
    <div className="space-y-6 pb-2">
      {/* Header + day navigator */}
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          יומן יומי
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{dayLabel}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{dateIso}</p>
      </section>

      <PremiumCard className="p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => goto(format(subDays(dateObj, 1), "yyyy-MM-dd"))}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-muted/60 text-foreground hover:bg-muted"
            aria-label="יום קודם"
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>

          <div className="flex flex-1 items-center justify-center gap-1.5">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary/12 px-3 py-2 text-xs font-medium text-primary"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              בחר תאריך
              <input
                type="date"
                value={dateIso}
                max={todayIso()}
                onChange={(e) => e.target.value && goto(e.target.value)}
                className="sr-only"
              />
            </label>
            {!isToday(dateObj) && (
              <button
                onClick={() => goto(todayIso())}
                className="rounded-full bg-muted/60 px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                חזרה להיום
              </button>
            )}
          </div>

          <button
            onClick={() => !isFuture && goto(format(addDays(dateObj, 1), "yyyy-MM-dd"))}
            disabled={isToday(dateObj)}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-muted/60 text-foreground hover:bg-muted disabled:opacity-40"
            aria-label="יום הבא"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </PremiumCard>

      {isLoading && (
        <PremiumCard>
          <p className="text-sm text-muted-foreground">טוען יומן…</p>
        </PremiumCard>
      )}

      {!isLoading && !hasAny && (
        <PremiumCard>
          <EmptyState
            icon={<CalendarIcon className="h-5 w-5" />}
            title="אין נתונים ליום זה"
            hint="לא נרשמה פעילות ביום זה."
          />
        </PremiumCard>
      )}

      {/* Daily totals */}
      {(meals.length > 0 || waterMl > 0 || workoutMinutes > 0) && (
        <section>
          <SectionHeader title="סיכום היום" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TotalTile label="קלוריות" value={Math.round(totals.calories).toString()} />
            <TotalTile label="חלבון (ג׳)" value={Math.round(totals.protein).toString()} />
            <TotalTile label="פחמימות (ג׳)" value={Math.round(totals.carbs).toString()} />
            <TotalTile label="שומן (ג׳)" value={Math.round(totals.fat).toString()} />
            <TotalTile label="סיבים (ג׳)" value={Math.round(totals.fiber).toString()} />
            <TotalTile label="מים (מ״ל)" value={waterMl.toString()} />
            <TotalTile label="דקות אימון" value={workoutMinutes.toString()} />
            <TotalTile label="תוספים" value={supplements.length.toString()} />
          </div>
        </section>
      )}

      {/* Meals */}
      <section>
        <SectionHeader
          title="ארוחות"
          action={<Icon><Apple className="h-4 w-4" /></Icon>}
        />
        <PremiumCard className="p-0">
          {meals.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<Apple className="h-5 w-5" />} title="לא נרשמו ארוחות" />
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {meals.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.food_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.meal_time ?? format(new Date(m.created_at), "HH:mm")} ·{" "}
                      {m.meal_type ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-left text-[11px] text-muted-foreground">
                    <div>{Math.round(Number(m.calories ?? 0))} קק״ל</div>
                    <div>חלבון {Math.round(Number(m.protein_g ?? 0))}g</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PremiumCard>
      </section>

      {/* Water */}
      <section>
        <SectionHeader
          title="שתייה"
          action={<Icon><Droplet className="h-4 w-4" /></Icon>}
        />
        <PremiumCard>
          {waterEvents.length === 0 ? (
            <EmptyState icon={<Droplet className="h-5 w-5" />} title="לא נרשמה שתייה" />
          ) : (
            <div>
              <p className="text-2xl font-bold">{waterMl} <span className="text-sm font-normal text-muted-foreground">מ״ל</span></p>
              <p className="mt-1 text-xs text-muted-foreground">
                {waterEvents.length} רישומים
              </p>
            </div>
          )}
        </PremiumCard>
      </section>

      {/* Workouts */}
      <section>
        <SectionHeader
          title="אימונים"
          action={<Icon><Dumbbell className="h-4 w-4" /></Icon>}
        />
        <PremiumCard className="p-0">
          {workouts.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<Dumbbell className="h-5 w-5" />} title="לא נרשמו אימונים" />
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {workouts.map((w) => (
                <li key={w.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name ?? "אימון"}</p>
                    {w.notes && (
                      <p className="truncate text-[11px] text-muted-foreground">{w.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {w.duration_min ?? "—"} דק׳
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PremiumCard>
      </section>

      {/* Supplements */}
      <section>
        <SectionHeader
          title="תוספים"
          action={<Icon><Pill className="h-4 w-4" /></Icon>}
        />
        <PremiumCard>
          {supplements.length === 0 ? (
            <EmptyState icon={<Pill className="h-5 w-5" />} title="לא נרשמו תוספים" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {supplements.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full bg-muted/60 px-3 py-1.5 text-xs"
                >
                  {s.emoji ?? "💊"} {s.label ?? "תוסף"}
                </span>
              ))}
            </div>
          )}
        </PremiumCard>
      </section>

      {/* Weight & Sleep */}
      <section className="grid grid-cols-2 gap-3">
        <PremiumCard>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Scale className="h-4 w-4" /> משקל
          </div>
          <p className="text-xl font-bold">
            {weightEvent ? `${Number(weightEvent.amount).toFixed(1)} ק״ג` : "—"}
          </p>
        </PremiumCard>
        <PremiumCard>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Moon className="h-4 w-4" /> שינה
          </div>
          <p className="text-xl font-bold">
            {sleepEvent ? `${Number(sleepEvent.amount).toFixed(1)} ש׳` : "—"}
          </p>
        </PremiumCard>
      </section>

      {/* Health / medical events */}
      <section>
        <SectionHeader
          title="אירועים רפואיים"
          action={<Icon><HeartPulse className="h-4 w-4" /></Icon>}
        />
        <PremiumCard className="p-0">
          {health.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<HeartPulse className="h-5 w-5" />} title="לא נרשמו אירועים רפואיים" />
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {health.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{String(h.area)}</p>
                    {h.notes && (
                      <p className="truncate text-[11px] text-muted-foreground">{h.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    כאב {h.pain_level ?? "—"}/10
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PremiumCard>
      </section>

      <div className="pt-2 text-center">
        <Link
          to="/dashboard"
          className="text-xs font-medium text-primary hover:underline"
        >
          ← חזרה למסך הבית
        </Link>
      </div>
    </div>
  );
}

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-3 text-center">
      <p className="text-lg font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
      {children}
    </div>
  );
}
