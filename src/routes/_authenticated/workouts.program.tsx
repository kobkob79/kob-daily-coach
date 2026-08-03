/**
 * /workouts/program — Weekly Planner 2.0 (VIORA-PLANNER-001).
 *
 * Planning intent only. Writes ONLY to `workout_plans`; sessions are read
 * for completion status and never modified.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Dumbbell,
  Plus,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getWeeklyPlan, setPlanSlot, WEEKDAY_HE } from "@/lib/workout-session";
import { AssignDayDialog, REST_DAY_LABEL } from "@/components/workouts/AssignDayDialog";
import { PlannerDayCard, type PlannerDay } from "@/components/workouts/PlannerDayCard";
import {
  dateForWeekday,
  deriveStatus,
  estimateMinutes,
  formatMinutes,
  formatWeekRange,
  isWeekInitialized,
  loadMode,
  markWeekInitialized,
  saveMode,
  startOfWeek,
  weekKey,
  type PlannerMode,
} from "@/lib/weekly-planner";

export const Route = createFileRoute("/_authenticated/workouts/program")({
  component: PlannerPage,
});

type TemplateMeta = {
  id: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  type: string | null;
};

function PlannerPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [mode, setMode] = useState<PlannerMode>("planned");
  const [weekReady, setWeekReady] = useState(true);

  useEffect(() => {
    setMode(loadMode());
    setWeekReady(isWeekInitialized());
  }, []);

  const changeMode = (m: PlannerMode) => {
    setMode(m);
    saveMode(m);
  };

  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });

  const templatesQ = useQuery({
    queryKey: ["planner_templates_meta"],
    queryFn: async (): Promise<TemplateMeta[]> => {
      const { data: tpls, error } = await supabase
        .from("workout_templates")
        .select("id,name")
        .order("name");
      if (error) throw error;
      const { data: rows, error: e2 } = await supabase
        .from("workout_template_exercises")
        .select("template_id,target_sets,exercises(muscle_group,category)");
      if (e2) throw e2;

      return (tpls ?? []).map((t) => {
        const mine = (rows ?? []).filter((r: any) => r.template_id === t.id);
        const setCount = mine.reduce((s: number, r: any) => s + (r.target_sets ?? 3), 0);
        const groups = new Map<string, number>();
        for (const r of mine) {
          const g = r.exercises?.muscle_group ?? r.exercises?.category;
          if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
        }
        const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
        return {
          id: t.id,
          name: t.name,
          exerciseCount: mine.length,
          setCount,
          type: top.length ? top.map(([g]) => g).join(" · ") : null,
        };
      });
    },
  });

  const sessionsQ = useQuery({
    queryKey: ["planner_week_sessions", weekKey()],
    queryFn: async () => {
      const from = startOfWeek().toISOString();
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id,status,plan_weekday,template_id,started_at")
        .gte("started_at", from);
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().getDay();

  const days: PlannerDay[] = WEEKDAY_HE.map((label, idx) => {
    const slot = planQ.data?.find((p) => p.weekday === idx) ?? null;
    const tpl = slot?.template_id
      ? templatesQ.data?.find((x) => x.id === slot.template_id)
      : undefined;
    const assigned = !!slot?.template_id;
    const rest = !assigned && slot?.display_name === REST_DAY_LABEL;
    const completed = (sessionsQ.data ?? []).some(
      (s: any) =>
        s.status === "completed" &&
        (s.plan_weekday === idx ||
          (s.template_id && slot?.template_id && s.template_id === slot.template_id)),
    );
    return {
      weekday: idx,
      weekdayLabel: label,
      date: dateForWeekday(idx),
      status: deriveStatus({ assigned, rest, completed, weekday: idx, today }),
      workoutName: assigned ? (tpl?.name ?? slot?.display_name ?? "אימון") : (slot?.display_name ?? null),
      workoutType: assigned ? (tpl?.type ?? null) : null,
      exerciseCount: tpl?.exerciseCount ?? 0,
      estimatedMinutes: tpl ? estimateMinutes(tpl.exerciseCount, tpl.setCount) : 0,
    };
  });

  const plannedDays = days.filter((d) => d.status !== "empty" && d.status !== "rest");
  const visible = mode === "planned" ? plannedDays : days;

  const plannedCount = plannedDays.length;
  const completedCount = plannedDays.filter((d) => d.status === "completed").length;
  const pct = plannedCount ? Math.round((completedCount / plannedCount) * 100) : 0;
  const totalMinutes = plannedDays.reduce((s, d) => s + d.estimatedMinutes, 0);

  /* ------------------------- drag & drop ------------------------- */

  const [drag, setDrag] = useState<{ weekday: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const move = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const a = planQ.data?.find((p) => p.weekday === from) ?? null;
      const b = planQ.data?.find((p) => p.weekday === to) ?? null;
      await setPlanSlot(to, a?.template_id ?? null, a?.display_name ?? null);
      await setPlanSlot(from, b?.template_id ?? null, b?.display_name ?? null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-plan"] });
      toast.success("האימון הועבר");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startDrag = (weekday: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = weekday;
    setDrag({ weekday, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const host = el?.closest("[data-day]") as HTMLElement | null;
      const target = host ? Number(host.dataset["day"]) : null;
      setOver(Number.isFinite(target) ? target : null);
    };
    const onUp = () => {
      const from = dragRef.current;
      if (from !== null && over !== null && over !== from) move.mutate({ from, to: over });
      dragRef.current = null;
      setDrag(null);
      setOver(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, over, move, planQ.data]);

  /* ------------------------- new week gate ------------------------- */

  const clearWeek = useMutation({
    mutationFn: async () => {
      for (const p of planQ.data ?? []) {
        if (p.template_id || p.display_name) await setPlanSlot(p.weekday, null, null);
      }
    },
    onSuccess: () => {
      markWeekInitialized();
      setWeekReady(true);
      qc.invalidateQueries({ queryKey: ["weekly-plan"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keepWeek = () => {
    markWeekInitialized();
    setWeekReady(true);
  };

  const loading = planQ.isPending || templatesQ.isPending;

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 pb-24 pt-2">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">תכנון שבועי</h1>
        <div className="w-16" />
      </div>

      {/* Week summary */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 p-5 hero-glow">
        <p className="text-[11px] uppercase tracking-wider text-primary">
          שבוע {formatWeekRange()}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">סיכום השבוע</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat icon={<Dumbbell className="h-3.5 w-3.5" />} value={`${plannedCount}`} label="מתוכננים" />
          <Stat
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            value={`${completedCount}`}
            label="הושלמו"
          />
          <Stat
            icon={<Timer className="h-3.5 w-3.5" />}
            value={formatMinutes(totalMinutes)}
            label="זמן משוער"
          />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>השלמת השבוע</span>
            <span className="font-bold text-foreground">{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* New-week choice — never copies automatically */}
      {!weekReady && (
        <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold">שבוע חדש התחיל</p>
          <p className="text-xs text-muted-foreground">
            בחר איך להתחיל — Viora לא תעתיק את השבוע הקודם לבד.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => clearWeek.mutate()} disabled={clearWeek.isPending}>
              <Plus className="ml-1 h-4 w-4" /> צור שבוע חדש
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={keepWeek}>
              <ClipboardCopy className="ml-1 h-4 w-4" /> העתק שבוע קודם
            </Button>
          </div>
        </div>
      )}

      {/* Mode switch */}
      <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
        <ModeTab active={mode === "planned"} onClick={() => changeMode("planned")}>
          <Dumbbell className="ml-1 h-3.5 w-3.5" /> אימונים מתוכננים
        </ModeTab>
        <ModeTab active={mode === "week"} onClick={() => changeMode("week")}>
          <CalendarDays className="ml-1 h-3.5 w-3.5" /> שבוע מלא
        </ModeTab>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : planQ.isError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-center">
          <p className="text-sm font-semibold">שגיאה בטעינת התוכנית</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => planQ.refetch()}>
            נסה שוב
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <EmptyWeek onCreate={() => setEditing(today)} onCopy={keepWeek} />
      ) : (
        <div className="space-y-3">
          {visible.map((d) => (
            <PlannerDayCard
              key={d.weekday}
              day={d}
              dragging={drag?.weekday === d.weekday}
              isDropTarget={!!drag && over === d.weekday && over !== drag.weekday}
              onEdit={() => setEditing(d.weekday)}
              onDragStart={startDrag(d.weekday)}
            />
          ))}
          {mode === "planned" && (
            <Button variant="outline" className="w-full" onClick={() => setEditing(today)}>
              <Plus className="ml-1 h-4 w-4" /> הוסף אימון לשבוע
            </Button>
          )}
        </div>
      )}

      {drag && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-primary bg-card px-3 py-2 text-xs font-bold shadow-glow"
          style={{ left: drag.x - 40, top: drag.y - 20 }}
        >
          גרור ליום אחר
        </div>
      )}

      {editing !== null && (
        <AssignDayDialog
          weekday={editing}
          current={planQ.data?.find((p) => p.weekday === editing) ?? null}
          templates={(templatesQ.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          isLoading={templatesQ.isPending}
          isError={templatesQ.isError}
          onRetry={() => templatesQ.refetch()}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            markWeekInitialized();
            setWeekReady(true);
            qc.invalidateQueries({ queryKey: ["weekly-plan"] });
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-2">
      <div className="flex items-center justify-center gap-1 text-primary">{icon}</div>
      <p className="mt-1 text-base font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-xs font-bold transition ${
        active ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyWeek({ onCreate, onCopy }: { onCreate: () => void; onCopy: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary/10">
        <CalendarDays className="h-9 w-9 text-primary" />
      </div>
      <p className="mt-4 text-lg font-bold">השבוע שלך ריק</p>
      <p className="mt-1 text-xs text-muted-foreground">
        שבץ אימון ליום כדי שנוכל לעקוב אחרי הביצוע
      </p>
      <div className="mt-4 space-y-2">
        <Button className="w-full" onClick={onCreate}>
          <Plus className="ml-1 h-4 w-4" /> צור אימון
        </Button>
        <Button variant="outline" className="w-full" onClick={onCopy}>
          <ClipboardCopy className="ml-1 h-4 w-4" /> העתק שבוע קודם
        </Button>
      </div>
    </div>
  );
}
