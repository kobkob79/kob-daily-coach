/**
 * Program Overview — "התוכנית שלך".
 *
 * A read-only view of the user's weekly/cycle plan with completion status
 * per slot. Normal users see the current calendar week; shift workers see
 * their rolling cycle progress.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Check, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWeeklyPlan, WEEKDAY_HE, listSessions } from "@/lib/workout-session";

export const Route = createFileRoute("/_authenticated/workouts/program")({
  component: ProgramPage,
});

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  const day = x.getDay(); // Sunday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function ProgramPage() {
  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });
  const sessionsQ = useQuery({
    queryKey: ["sessions", "week"],
    queryFn: () => listSessions(50),
  });
  const templatesQ = useQuery({
    queryKey: ["workout_templates_min"],
    queryFn: async () => {
      const { data } = await supabase.from("workout_templates").select("id,name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const weekStart = startOfWeek();
  const completedThisWeek = (sessionsQ.data ?? []).filter(
    (s) =>
      s.status === "completed" &&
      s.finished_at &&
      new Date(s.finished_at) >= weekStart,
  );
  const planned = (planQ.data ?? []).filter((p) => p.template_id);
  const doneIds = new Set(
    completedThisWeek.map((s) => s.template_id).filter(Boolean) as string[],
  );
  const progress =
    planned.length > 0
      ? Math.round((Math.min(doneIds.size, planned.length) / planned.length) * 100)
      : 0;

  const today = new Date().getDay();

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-5 pb-24 pt-2">
      <Button asChild variant="ghost" size="sm">
        <Link to="/workouts">
          <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
        </Link>
      </Button>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 p-6 hero-glow">
        <p className="text-[11px] uppercase tracking-wider text-primary">התוכנית שלך</p>
        <h1 className="mt-1 text-3xl font-extrabold">שבוע האימון</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {planned.length} אימונים בשבוע · {progress}% הושלמו
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-primary shadow-glow transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Days */}
      <div className="space-y-3">
        {WEEKDAY_HE.map((label, idx) => {
          const slot = planQ.data?.find((p) => p.weekday === idx);
          const tpl = slot?.template_id
            ? templatesQ.data?.find((t) => t.id === slot.template_id)
            : null;
          const done = slot?.template_id ? doneIds.has(slot.template_id) : false;
          const isToday = idx === today;
          return (
            <div
              key={idx}
              className={`flex items-center gap-3 rounded-2xl border p-4 ${
                isToday && !done
                  ? "border-primary bg-card shadow-glow"
                  : done
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-border bg-card"
              }`}
            >
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-bold ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-5 w-5" strokeWidth={3} /> : label}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  יום {label}
                  {isToday ? " · היום" : ""}
                </p>
                <p className="truncate text-base font-bold">
                  {tpl?.name ?? slot?.display_name ?? "יום חופש"}
                </p>
              </div>
              {slot?.template_id && (
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
