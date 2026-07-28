/**
 * Exercise detail — per-set rows for the active session.
 *
 * - The next open set is lifted into a focused "active set" card at the top:
 *   set X of Y, weight, reps and one primary action ("סיימתי סט").
 * - Completed sets stay visible but quieter; they can be reopened.
 * - Future sets are compact and keep their suggested values.
 * - Completing a set starts the shared rest timer (sessionStorage-backed),
 *   which now also previews the next set.
 * - Nothing here writes to the DB on a tick; the workout timer is derived
 *   from `started_at`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronRight,
  Trash2,
  Plus,
  Minus,
  Flame,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteSet,
  getSession,
  getSessionSets,
  insertPlannedSet,
  updateSet,
  getExercisePR,
  type SessionSet,
} from "@/lib/workout-session";
import { useRestTimer, formatClock } from "@/hooks/useRestTimer";
import { useWorkoutTimer, formatTotalTime } from "@/hooks/useWorkoutTimer";

const DEFAULT_REST = 90;

export const Route = createFileRoute(
  "/_authenticated/workouts/session/$sessionId/exercise/$exerciseId",
)({
  component: ExerciseDetailPage,
});

function ExerciseDetailPage() {
  const { sessionId, exerciseId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const rest = useRestTimer(sessionId);
  const [finishOpen, setFinishOpen] = useState(false);

  const sessionQ = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
  const total = useWorkoutTimer(
    sessionId,
    sessionQ.data?.started_at,
    sessionQ.data?.status === "in_progress",
  );
  const setsQ = useQuery({
    queryKey: ["session_sets", sessionId],
    queryFn: () => getSessionSets(sessionId),
  });
  const exQ = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,image_path,description")
        .eq("id", exerciseId)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        muscle_group: string | null;
        image_path: string | null;
        description: string | null;
      } | null;
    },
  });
  const prQ = useQuery({
    queryKey: ["exercise_pr", exerciseId],
    queryFn: () => getExercisePR(exerciseId),
  });

  const allSets = useMemo(() => setsQ.data ?? [], [setsQ.data]);
  const sets = useMemo(
    () =>
      allSets
        .filter((s) => s.exercise_id === exerciseId)
        .sort((a, b) => a.set_number - b.set_number),
    [allSets, exerciseId],
  );

  // Order of exercises in the session comes from set position.
  const orderedExerciseIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...allSets].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.set_number - b.set_number,
    )) {
      if (!seen.has(s.exercise_id)) {
        seen.add(s.exercise_id);
        out.push(s.exercise_id);
      }
    }
    return out;
  }, [allSets]);

  const nextExerciseId = useMemo(() => {
    const i = orderedExerciseIds.indexOf(exerciseId);
    if (i < 0) return null;
    for (const id of orderedExerciseIds.slice(i + 1)) {
      const exSets = allSets.filter((s) => s.exercise_id === id);
      if (exSets.some((s) => !s.completed_at)) return id;
    }
    return null;
  }, [orderedExerciseIds, exerciseId, allSets]);

  const nextExQ = useQuery({
    enabled: !!nextExerciseId,
    queryKey: ["exercise_name", nextExerciseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id,name")
        .eq("id", nextExerciseId!)
        .maybeSingle();
      return (data?.name as string | undefined) ?? null;
    },
  });

  const completeMut = useMutation({
    mutationFn: async (s: SessionSet) => {
      const stopped = rest.stop();
      await updateSet(s.id, {
        completed_at: new Date().toISOString(),
        actual_rest_seconds: stopped?.actualSec ?? null,
        overtime_seconds: stopped?.overtimeSec ?? null,
      });
    },
    onSuccess: (_r, s) => {
      qc.invalidateQueries({ queryKey: ["session_sets", sessionId] });
      qc.invalidateQueries({ queryKey: ["active-session-current"] });
      rest.start({
        plannedSec: s.planned_rest_seconds ?? DEFAULT_REST,
        exerciseId: s.exercise_id,
        setNumber: s.set_number + 1,
      });
    },
  });

  const uncompleteMut = useMutation({
    mutationFn: async (s: SessionSet) => updateSet(s.id, { completed_at: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const patchMut = useMutation({
    mutationFn: async ({
      id,
      patch,
      propagate,
    }: {
      id: string;
      patch: Partial<SessionSet>;
      propagate?: { field: "weight_kg" | "reps"; value: number | null; fromSetNumber: number };
    }) => {
      await updateSet(id, patch);
      if (propagate) {
        const targets = sets.filter(
          (s) => !s.completed_at && s.set_number > propagate.fromSetNumber,
        );
        for (const o of targets) {
          await updateSet(o.id, { [propagate.field]: propagate.value } as Partial<SessionSet>);
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const last = sets[sets.length - 1];
      const nextNumber = (last?.set_number ?? 0) + 1;
      const nextPos = (allSets[allSets.length - 1]?.position ?? 0) + 1;
      await insertPlannedSet({
        sessionId,
        exerciseId,
        position: nextPos,
        setNumber: nextNumber,
        weightKg: last?.weight_kg ?? null,
        reps: last?.reps ?? null,
        plannedRestSec: last?.planned_rest_seconds ?? DEFAULT_REST,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => deleteSet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const doneCount = sets.filter((s) => s.completed_at).length;
  const remaining = sets.length - doneCount;
  const activeSet = sets.find((s) => !s.completed_at) ?? null;
  const exerciseVolume = Math.round(
    sets
      .filter((s) => s.completed_at)
      .reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
  );
  const bestWeight = Math.max(
    0,
    ...sets.filter((s) => s.completed_at).map((s) => s.weight_kg ?? 0),
  );
  const isPR = bestWeight > 0 && bestWeight > (prQ.data ?? 0);

  const backToOverview = () =>
    navigate({ to: "/workouts/session/$sessionId", params: { sessionId } });

  const finishExercise = () => {
    rest.clear();
    setFinishOpen(false);
    toast.success("התרגיל הושלם");
    backToOverview();
  };

  const goToNextExercise = () => {
    rest.clear();
    if (!nextExerciseId) {
      backToOverview();
      return;
    }
    navigate({
      to: "/workouts/session/$sessionId/exercise/$exerciseId",
      params: { sessionId, exerciseId: nextExerciseId },
    });
  };

  const handleFinishExercise = () => {
    if (remaining > 0) {
      setFinishOpen(true);
      return;
    }
    finishExercise();
  };

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 pb-48 pt-2">
      {/* Header */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <Button variant="ghost" size="icon" onClick={backToOverview} aria-label="חזרה לסקירת האימון">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <p className="truncate text-center text-xs text-muted-foreground">
          {doneCount}/{sets.length} סטים
        </p>
        <div className="w-9" />
      </div>

      {/* Hero */}
      <div className="surface-card overflow-hidden p-0">
        {exQ.data?.image_path ? (
          <img src={exQ.data.image_path} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div className="grid h-40 place-items-center text-5xl">🏋️</div>
        )}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {exQ.data?.muscle_group ?? ""}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold">
            {exQ.data?.name ?? "—"}
            {isPR && <Trophy className="h-5 w-5 text-primary" />}
          </h1>
          {prQ.data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              שיא אישי: <span className="font-bold text-foreground">{prQ.data} ק״ג</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Active set focus / exercise completed */}
      {activeSet ? (
        <ActiveSetCard
          key={activeSet.id}
          set={activeSet}
          totalSets={sets.length}
          onChange={(field, value) =>
            patchMut.mutate({
              id: activeSet.id,
              patch: { [field]: value } as Partial<SessionSet>,
              propagate: { field, value, fromSetNumber: activeSet.set_number },
            })
          }
          onComplete={() => completeMut.mutate(activeSet)}
          disabled={completeMut.isPending}
        />
      ) : (
        <div className="rounded-3xl border border-primary bg-primary/[0.06] p-4 shadow-glow">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <p className="text-base font-extrabold">התרגיל הושלם</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {doneCount} סטים
            {exerciseVolume > 0 ? ` · נפח ${exerciseVolume} ק״ג` : ""}
          </p>
          {nextExerciseId && (
            <p className="mt-1 text-sm text-muted-foreground">
              הבא: <span className="font-bold text-foreground">{nextExQ.data ?? "…"}</span>
            </p>
          )}
          <div className="mt-3 grid gap-2">
            {nextExerciseId && (
              <Button className="h-12 font-bold" onClick={goToNextExercise}>
                לתרגיל הבא
              </Button>
            )}
            <Button variant="outline" className="h-12 font-bold" onClick={backToOverview}>
              חזרה לסקירת האימון
            </Button>
          </div>
        </div>
      )}

      {/* Set rows */}
      <div className="space-y-2">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>#</span>
          <span>משקל (ק״ג)</span>
          <span>חזרות</span>
          <span />
        </div>
        {sets.map((s) => (
          <SetRow
            key={s.id}
            set={s}
            isActive={s.id === activeSet?.id}
            onComplete={() => completeMut.mutate(s)}
            onUncomplete={() => uncompleteMut.mutate(s)}
            onDelete={() => removeMut.mutate(s.id)}
            onChange={(field, value) =>
              patchMut.mutate({
                id: s.id,
                patch: { [field]: value } as Partial<SessionSet>,
                propagate: s.completed_at
                  ? undefined
                  : { field, value, fromSetNumber: s.set_number },
              })
            }
          />
        ))}

        <button
          onClick={() => addMut.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" /> הוסף סט
        </button>
      </div>

      {/* Fixed bottom stack: rest timer + finish exercise + total */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-md space-y-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        {rest.active && (
          <RestPanel
            phase={rest.phase}
            remainingSec={rest.remainingSec}
            overtimeSec={rest.overtimeSec}
            nextSetNumber={activeSet?.set_number ?? null}
            totalSets={sets.length}
            nextWeight={activeSet?.weight_kg ?? null}
            nextReps={activeSet?.reps ?? null}
            onAdd={() => rest.addSeconds(15)}
            onSub={() => rest.addSeconds(-15)}
            onSkip={() => rest.clear()}
          />
        )}
        {doneCount > 0 && activeSet && (
          <button
            onClick={handleFinishExercise}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-card/90 text-base font-bold text-foreground backdrop-blur-xl transition active:scale-[0.98]"
          >
            <CheckCircle2 className="h-5 w-5 text-primary" />
            סיימתי תרגיל
          </button>
        )}
        <div className="glass-tile flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <span>זמן אימון</span>
          </div>
          <span className="font-mono text-sm font-bold tabular-nums">
            {formatTotalTime(total.elapsedSec)}
          </span>
        </div>
      </div>

      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>נותרו {remaining} סטים בתרגיל</AlertDialogTitle>
            <AlertDialogDescription>
              הסטים שלא בוצעו לא ייספרו כבוצעו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>חזור לתרגיל</AlertDialogCancel>
            <AlertDialogAction onClick={finishExercise}>
              סיים את התרגיל עם הסטים שבוצעו
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prevent unused-var warning in some builds */}
      <span className="hidden">{sessionQ.data?.id}</span>
    </div>
  );
}

/* ---------------- Active set card ---------------- */

function ActiveSetCard({
  set,
  totalSets,
  onChange,
  onComplete,
  disabled,
}: {
  set: SessionSet;
  totalSets: number;
  onChange: (field: "weight_kg" | "reps", value: number | null) => void;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const [w, setW] = useState<string>(set.weight_kg?.toString() ?? "");
  const [r, setR] = useState<string>(set.reps?.toString() ?? "");
  const initial = useRef({ w: set.weight_kg, r: set.reps });

  useEffect(() => {
    setW(set.weight_kg?.toString() ?? "");
    setR(set.reps?.toString() ?? "");
    initial.current = { w: set.weight_kg, r: set.reps };
  }, [set.weight_kg, set.reps, set.id]);

  const commit = (field: "weight_kg" | "reps", raw: string) => {
    const value = raw === "" ? null : Number(raw);
    if (Number.isNaN(value as number)) return;
    if (field === "weight_kg" && value === initial.current.w) return;
    if (field === "reps" && value === initial.current.r) return;
    initial.current = field === "weight_kg" ? { ...initial.current, w: value } : { ...initial.current, r: value };
    onChange(field, value);
  };

  return (
    <div className="rounded-3xl border border-primary bg-primary/[0.06] p-4 shadow-glow">
      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
        סט {set.set_number} מתוך {totalSets}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">משקל (ק״ג)</span>
          <Input
            inputMode="decimal"
            type="number"
            step="0.5"
            value={w}
            onChange={(e) => setW(e.target.value)}
            onBlur={() => commit("weight_kg", w)}
            className="h-14 text-center text-2xl font-extrabold tabular-nums"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">חזרות</span>
          <Input
            inputMode="numeric"
            type="number"
            value={r}
            onChange={(e) => setR(e.target.value)}
            onBlur={() => commit("reps", r)}
            className="h-14 text-center text-2xl font-extrabold tabular-nums"
          />
        </label>
      </div>
      <Button
        className="mt-3 h-14 w-full text-lg font-extrabold"
        onClick={onComplete}
        disabled={disabled}
      >
        <CheckCircle2 className="ml-1 h-5 w-5" />
        סיימתי סט
      </Button>
    </div>
  );
}

/* ---------------- SetRow ---------------- */

function SetRow({
  set,
  isActive,
  onComplete,
  onUncomplete,
  onDelete,
  onChange,
}: {
  set: SessionSet;
  isActive: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onChange: (field: "weight_kg" | "reps", value: number | null) => void;
}) {
  const done = !!set.completed_at;
  const [w, setW] = useState<string>(set.weight_kg?.toString() ?? "");
  const [r, setR] = useState<string>(set.reps?.toString() ?? "");
  const initial = useRef({ w: set.weight_kg, r: set.reps });

  // Rehydrate when parent sets change (propagation)
  useEffect(() => {
    setW(set.weight_kg?.toString() ?? "");
    setR(set.reps?.toString() ?? "");
    initial.current = { w: set.weight_kg, r: set.reps };
  }, [set.weight_kg, set.reps, set.id]);

  const commit = (field: "weight_kg" | "reps", raw: string) => {
    const value = raw === "" ? null : Number(raw);
    if (Number.isNaN(value as number)) return;
    if (field === "weight_kg" && value === initial.current.w) return;
    if (field === "reps" && value === initial.current.r) return;
    onChange(field, value);
  };

  const rowClass = done
    ? "border-primary/30 bg-muted/30"
    : isActive
      ? "border-primary/60 bg-primary/[0.04]"
      : "border-border bg-card";

  const numberClass = done
    ? "bg-primary/15 text-primary"
    : isActive
      ? "bg-primary text-primary-foreground"
      : "bg-muted";

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 rounded-2xl border p-2 transition ${rowClass}`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${numberClass}`}
      >
        {set.set_number}
      </span>
      <Input
        inputMode="decimal"
        type="number"
        step="0.5"
        value={w}
        disabled={done}
        onChange={(e) => setW(e.target.value)}
        onBlur={() => commit("weight_kg", w)}
        className="h-11 min-w-0 text-center text-base font-bold tabular-nums"
      />
      <Input
        inputMode="numeric"
        type="number"
        value={r}
        disabled={done}
        onChange={(e) => setR(e.target.value)}
        onBlur={() => commit("reps", r)}
        className="h-11 min-w-0 text-center text-base font-bold tabular-nums"
      />
      <div className="flex items-center justify-end gap-1">
        {done ? (
          <button
            onClick={onUncomplete}
            className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary"
            aria-label="פתח מחדש את הסט (הושלם)"
            title="הושלם — פתח מחדש"
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
        ) : isActive ? (
          <button
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
            aria-label="מחק סט"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={onComplete}
              className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground"
              aria-label="סמן סט כבוצע"
              title="סמן כבוצע"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              aria-label="מחק סט"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Rest panel ---------------- */

function RestPanel({
  phase,
  remainingSec,
  overtimeSec,
  nextSetNumber,
  totalSets,
  nextWeight,
  nextReps,
  onAdd,
  onSub,
  onSkip,
}: {
  phase: "idle" | "running" | "overtime";
  remainingSec: number;
  overtimeSec: number;
  nextSetNumber: number | null;
  totalSets: number;
  nextWeight: number | null;
  nextReps: number | null;
  onAdd: () => void;
  onSub: () => void;
  onSkip: () => void;
}) {
  const over = phase === "overtime";
  return (
    <div className="glass-tile space-y-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            {over ? "מוכן לסט הבא" : "מנוחה"}
          </p>
          {nextSetNumber != null && (
            <p className="truncate text-xs text-muted-foreground">
              הבא: סט {nextSetNumber} מתוך {totalSets}
              {nextWeight != null || nextReps != null
                ? ` · ${nextWeight ?? "—"} ק״ג × ${nextReps ?? "—"}`
                : ""}
            </p>
          )}
        </div>
        <p
          className={`font-mono text-3xl font-extrabold tabular-nums ${
            over ? "text-primary" : "text-foreground"
          }`}
        >
          {over ? `+${formatClock(overtimeSec)}` : formatClock(remainingSec)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={onSub}
          className="flex h-10 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-semibold"
          aria-label="הפחת 15 שניות"
        >
          <Minus className="h-4 w-4" /> 15
        </button>
        <button
          onClick={onSkip}
          className="h-10 rounded-xl bg-primary/15 text-sm font-bold text-primary"
        >
          דלג
        </button>
        <button
          onClick={onAdd}
          className="flex h-10 items-center justify-center gap-1 rounded-xl bg-muted text-sm font-semibold"
          aria-label="הוסף 15 שניות"
        >
          <Plus className="h-4 w-4" /> 15
        </button>
      </div>
    </div>
  );
}
