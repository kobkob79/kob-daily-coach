/**
 * /workouts/program — Weekly Planner (VIORA-WORKOUT-NAV-004).
 *
 * Planning intent only. All seven weekdays are shown; each day is either
 * assigned to a template, marked as a rest day, or empty. Editing here
 * writes ONLY to `workout_plans` and never touches `workout_sessions`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Dumbbell, Moon, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWeeklyPlan, WEEKDAY_HE } from "@/lib/workout-session";
import { AssignDayDialog, REST_DAY_LABEL } from "@/components/workouts/AssignDayDialog";

export const Route = createFileRoute("/_authenticated/workouts/program")({
  component: PlannerPage,
});

/** Date of `weekday` inside the current week (Sunday-based), for DD.MM display. */
function dateForWeekday(weekday: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + weekday);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function PlannerPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);

  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });
  const templatesQ = useQuery({
    queryKey: ["workout_templates_min"],
    queryFn: async () => {
      const { data } = await supabase.from("workout_templates").select("id,name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const planned = (planQ.data ?? []).filter((p) => p.template_id);
  const today = new Date().getDay();

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-5 pb-24 pt-2">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">תכנון שבועי</h1>
        <div className="w-16" />
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-primary/30 p-6 hero-glow">
        <p className="text-[11px] uppercase tracking-wider text-primary">התוכנית שלך</p>
        <h2 className="mt-1 text-3xl font-extrabold">שבוע האימון</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {planned.length} אימונים מתוכננים בשבוע · תכנון בלבד, לא משפיע על אימונים שבוצעו
        </p>
      </div>

      <div className="space-y-3">
        {WEEKDAY_HE.map((label, idx) => {
          const slot = planQ.data?.find((p) => p.weekday === idx) ?? null;
          const tpl = slot?.template_id
            ? templatesQ.data?.find((x) => x.id === slot.template_id)
            : null;
          const isAssigned = !!slot?.template_id;
          const isRest = !isAssigned && slot?.display_name === REST_DAY_LABEL;
          const isToday = idx === today;
          const date = dateForWeekday(idx);

          // Each state has its own surface + badge so it reads without icons.
          const stateClass = isAssigned
            ? "border-primary/50 bg-primary/10"
            : isRest
              ? "border-border bg-muted/40"
              : "border-dashed border-border bg-card";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setEditing(idx)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition active:scale-[0.99] ${stateClass} ${
                isToday ? "ring-2 ring-primary shadow-glow" : ""
              }`}
            >
              <div
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-sm font-bold leading-tight ${
                  isAssigned
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span>{label}</span>
                <span className="text-[10px] font-medium tabular-nums opacity-80">
                  {formatDate(date)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>יום {label}</span>
                  {isToday && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      היום
                    </span>
                  )}
                </p>
                <p
                  className={`truncate text-base font-bold ${
                    isAssigned ? "" : "text-muted-foreground"
                  }`}
                >
                  {tpl?.name ?? slot?.display_name ?? "יום פנוי"}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold">
                  {isAssigned ? (
                    <span className="text-primary">אימון משויך</span>
                  ) : isRest ? (
                    <span className="text-muted-foreground">יום מנוחה</span>
                  ) : (
                    <span className="text-muted-foreground">ללא שיוך · הקש להוספה</span>
                  )}
                </p>
              </div>
              {isAssigned ? (
                <span className="flex items-center gap-2 text-primary">
                  <Dumbbell className="h-4 w-4" />
                  <Pencil className="h-4 w-4" />
                </span>
              ) : isRest ? (
                <Moon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Plus className="h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>


      {editing !== null && (
        <AssignDayDialog
          weekday={editing}
          current={planQ.data?.find((p) => p.weekday === editing) ?? null}
          templates={templatesQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["weekly-plan"] });
          }}
        />
      )}
    </div>
  );
}
