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

function PlannerPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);

  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });
  const templatesQ = useQuery({
    queryKey: ["workout_templates_min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_templates")
        .select("id,name")
        .order("name");
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
          const isRest = !slot?.template_id && slot?.display_name === REST_DAY_LABEL;
          const isToday = idx === today;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setEditing(idx)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition active:scale-[0.99] ${
                isToday ? "border-primary bg-card shadow-glow" : "border-border bg-card"
              }`}
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
                {label}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  יום {label}
                  {isToday ? " · היום" : ""}
                </p>
                <p className="truncate text-base font-bold">
                  {tpl?.name ?? slot?.display_name ?? "לא שויך אימון"}
                </p>
              </div>
              {slot?.template_id ? (
                <span className="flex items-center gap-2 text-muted-foreground">
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
