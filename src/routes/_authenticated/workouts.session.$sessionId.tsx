/**
 * Active Workout Session — Sprint 1.
 *
 * Focused, one-hand UI for the gym: one exercise on screen, its planned
 * sets underneath, a fixed rest timer at the bottom. Editing a weight or
 * rep count propagates to every not-yet-completed set of the same exercise.
 * Exiting mid-session confirms continue / save / discard.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  X,
  Minus,
  Play as PlayIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteSet,
  discardSession,
  finalizeSession,
  getSession,
  getSessionSets,
  insertPlannedSet,
  updateSet,
  type SessionSet,
} from "@/lib/workout-session";
import { useRestTimer, formatClock } from "@/hooks/useRestTimer";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId")({
  component: ActiveSessionPage,
});

const DEFAULT_REST_SEC = 90;

interface TemplateRow {
  id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  exercises: { id: string; name: string; muscle_group: string | null } | null;
}

function ActiveSessionPage() {
  const { sessionId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const timer = useRestTimer(sessionId);

  const sessionQ = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
  });

  const templateId = sessionQ.data?.template_id ?? null;

  const rowsQ = useQuery({
    enabled: !!templateId,
    queryKey: ["session_template_rows", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id,exercise_id,position,target_sets,target_reps,target_weight_kg,exercises(id,name,muscle_group)",
        )
        .eq("template_id", templateId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as TemplateRow[];
    },
  });

  const setsQ = useQuery({
    queryKey: ["session_sets", sessionId],
    queryFn: () => getSessionSets(sessionId),
  });

  // Seed planned sets from the template exactly once (when none exist).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    (async () => {
      if (seeded) return;
      if (!rowsQ.data || setsQ.isLoading) return;
      if ((setsQ.data ?? []).length > 0) {
        setSeeded(true);
        return;
      }
      let pos = 0;
      for (const r of rowsQ.data) {
        for (let n = 1; n <= (r.target_sets ?? 1); n++) {
          pos += 1;
          await insertPlannedSet({
            sessionId,
            exerciseId: r.exercise_id,
            position: pos,
            setNumber: n,
            weightKg: r.target_weight_kg,
            reps: r.target_reps,
            plannedRestSec: DEFAULT_REST_SEC,
          });
        }
      }
      setSeeded(true);
      qc.invalidateQueries({ queryKey: ["session_sets", sessionId] });
    })();
  }, [rowsQ.data, setsQ.data, setsQ.isLoading, seeded, sessionId, qc]);

  const exercises = rowsQ.data ?? [];
  const sets = setsQ.data ?? [];

  // Group sets by exercise, sorted by set_number.
  const setsByExercise = useMemo(() => {
    const map = new Map<string, SessionSet[]>();
    for (const s of sets) {
      const arr = map.get(s.exercise_id) ?? [];
      arr.push(s);
      map.set(s.exercise_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.set_number - b.set_number);
    return map;
  }, [sets]);

  // Current exercise: first with any incomplete set, else last.
  const autoIndex = useMemo(() => {
    for (let i = 0; i < exercises.length; i++) {
      const arr = setsByExercise.get(exercises[i].exercise_id) ?? [];
      if (arr.some((s) => !s.completed_at) || arr.length === 0) return i;
    }
    return Math.max(0, exercises.length - 1);
  }, [exercises, setsByExercise]);

  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const exIndex = manualIndex ?? autoIndex;
  const current = exercises[exIndex];
  const currentSets = current ? setsByExercise.get(current.exercise_id) ?? [] : [];

  const completeSet = useMutation({
    mutationFn: async (s: SessionSet) => {
      // Stop rest timer if it was running (attach to *previous* completed set is tricky;
      // instead we record the elapsed rest on THIS set as `actual_rest_seconds` from the
      // previous completion timestamp). Timer stop returns planned/actual/overtime.
      const stopped = timer.stop();
      await updateSet(s.id, {
        completed_at: new Date().toISOString(),
        actual_rest_seconds: stopped?.actualSec ?? null,
        overtime_seconds: stopped?.overtimeSec ?? null,
        planned_rest_seconds: stopped?.plannedSec ?? s.planned_rest_seconds,
      });
    },
    onSuccess: (_res, s) => {
      qc.invalidateQueries({ queryKey: ["session_sets", sessionId] });
      // Start rest for next set in same exercise, or default rest.
      const rest = s.planned_rest_seconds ?? DEFAULT_REST_SEC;
      timer.start({ plannedSec: rest, exerciseId: s.exercise_id, setNumber: s.set_number + 1 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSetFields = useMutation({
    mutationFn: async ({
      id,
      patch,
      propagate,
    }: {
      id: string;
      patch: Partial<SessionSet>;
      propagate?: { field: "weight_kg" | "reps"; value: number | null; exerciseId: string; fromSetNumber: number };
    }) => {
      await updateSet(id, patch);
      if (propagate) {
        const others = (setsQ.data ?? []).filter(
          (s) =>
            s.exercise_id === propagate.exerciseId &&
            !s.completed_at &&
            s.set_number > propagate.fromSetNumber,
        );
        for (const o of others) {
          await updateSet(o.id, { [propagate.field]: propagate.value } as Partial<SessionSet>);
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addSet = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const last = currentSets[currentSets.length - 1];
      const nextNumber = (last?.set_number ?? 0) + 1;
      const nextPos = (sets[sets.length - 1]?.position ?? 0) + 1;
      await insertPlannedSet({
        sessionId,
        exerciseId: current.exercise_id,
        position: nextPos,
        setNumber: nextNumber,
        weightKg: last?.weight_kg ?? current.target_weight_kg ?? null,
        reps: last?.reps ?? current.target_reps ?? null,
        plannedRestSec: last?.planned_rest_seconds ?? DEFAULT_REST_SEC,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const removeSet = useMutation({
    mutationFn: async (id: string) => deleteSet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const [exitOpen, setExitOpen] = useState(false);

  if (sessionQ.isLoading || rowsQ.isLoading) {
    return <p className="p-6 text-center text-sm">…</p>;
  }
  if (!current) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        אין תרגילים בתבנית.
      </div>
    );
  }

  const totalExercises = exercises.length;
  const completedCount = currentSets.filter((s) => s.completed_at).length;

  return (
    <div dir="rtl" className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md flex-col gap-3 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setExitOpen(true)}>
          <X className="h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground">
          תרגיל {exIndex + 1} מתוך {totalExercises}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({
              to: "/workouts/session/$sessionId/summary",
              params: { sessionId },
            })
          }
        >
          סיים
        </Button>
      </div>

      {/* Current exercise header */}
      <div className="surface-card space-y-1 p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {current.exercises?.muscle_group ?? ""}
        </p>
        <h2 className="text-2xl font-extrabold leading-tight">
          {current.exercises?.name ?? "—"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {completedCount} מתוך {currentSets.length} סטים הושלמו
        </p>
      </div>

      {/* Sets list */}
      <div className="space-y-2">
        {currentSets.map((s) => (
          <SetRow
            key={s.id}
            set={s}
            onComplete={() => completeSet.mutate(s)}
            onChange={(field, value) =>
              updateSetFields.mutate({
                id: s.id,
                patch: { [field]: value } as Partial<SessionSet>,
                propagate: s.completed_at
                  ? undefined
                  : { field, value, exerciseId: s.exercise_id, fromSetNumber: s.set_number },
              })
            }
            onDelete={() => removeSet.mutate(s.id)}
          />
        ))}
        <Button variant="ghost" className="w-full" onClick={() => addSet.mutate()}>
          <Plus className="mr-1 h-4 w-4" /> הוסף סט
        </Button>
      </div>

      {/* Exercise nav */}
      <div className="flex items-center justify-between text-xs">
        <Button
          variant="ghost"
          size="sm"
          disabled={exIndex === 0}
          onClick={() => setManualIndex(Math.max(0, exIndex - 1))}
        >
          <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" />
          הקודם
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={exIndex >= totalExercises - 1}
          onClick={() => setManualIndex(Math.min(totalExercises - 1, exIndex + 1))}
        >
          הבא
          <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      {exercises[exIndex + 1] && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
          <p className="text-[11px] text-muted-foreground">הבא בתור</p>
          <p className="text-sm font-medium">{exercises[exIndex + 1].exercises?.name}</p>
        </div>
      )}

      {/* Fixed rest timer */}
      {timer.active && (
        <RestBar
          remainingSec={timer.remainingSec}
          overtimeSec={timer.overtimeSec}
          phase={timer.phase}
          onAdd={() => timer.addSeconds(15)}
          onSub={() => timer.addSeconds(-15)}
          onSkip={() => timer.clear()}
        />
      )}
      {!timer.active && currentSets.some((s) => !s.completed_at) && (
        <div className="fixed inset-x-0 bottom-20 mx-auto max-w-md px-4">
          <div className="surface-card flex items-center justify-between p-3">
            <span className="text-xs text-muted-foreground">מנוחה מוכנה</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                timer.start({
                  plannedSec: DEFAULT_REST_SEC,
                  exerciseId: current.exercise_id,
                  setNumber: (currentSets.find((s) => !s.completed_at)?.set_number ?? 1),
                })
              }
            >
              <PlayIcon className="mr-1 h-3.5 w-3.5" /> התחל מנוחה
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>לצאת מהאימון?</AlertDialogTitle>
            <AlertDialogDescription>
              אפשר להמשיך, לסיים ולשמור, או לזרוק את האימון.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>המשך</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                navigate({
                  to: "/workouts/session/$sessionId/summary",
                  params: { sessionId },
                })
              }
            >
              סיים ושמור
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                await discardSession(sessionId);
                timer.clear();
                navigate({ to: "/workouts" });
              }}
            >
              זרוק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SetRow({
  set,
  onComplete,
  onChange,
  onDelete,
}: {
  set: SessionSet;
  onComplete: () => void;
  onChange: (field: "weight_kg" | "reps", value: number | null) => void;
  onDelete: () => void;
}) {
  const done = !!set.completed_at;
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-2 ${
        done ? "border-success/30 bg-success/5" : "border-border/60"
      }`}
    >
      <span className="w-6 text-center text-sm font-semibold text-muted-foreground">
        {set.set_number}
      </span>
      <Input
        inputMode="decimal"
        className="h-11 text-center text-lg font-semibold"
        placeholder="ק״ג"
        value={set.weight_kg ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange("weight_kg", v === "" ? null : Number(v));
        }}
        disabled={done}
      />
      <span className="text-muted-foreground">×</span>
      <Input
        inputMode="numeric"
        className="h-11 text-center text-lg font-semibold"
        placeholder="חזרות"
        value={set.reps ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange("reps", v === "" ? null : Number(v));
        }}
        disabled={done}
      />
      {done ? (
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-success/20 text-success">
          <Check className="h-5 w-5" />
        </span>
      ) : (
        <Button size="icon" className="h-11 w-11 rounded-xl" onClick={onComplete}>
          <Check className="h-5 w-5" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0 text-muted-foreground"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function RestBar({
  remainingSec,
  overtimeSec,
  phase,
  onAdd,
  onSub,
  onSkip,
}: {
  remainingSec: number;
  overtimeSec: number;
  phase: "idle" | "running" | "overtime";
  onAdd: () => void;
  onSub: () => void;
  onSkip: () => void;
}) {
  const isOver = phase === "overtime";
  return (
    <div className="fixed inset-x-0 bottom-20 mx-auto max-w-md px-4">
      <div
        className={`surface-card flex items-center justify-between gap-2 p-3 ${
          isOver ? "ring-1 ring-destructive/60" : "ring-1 ring-primary/30"
        }`}
      >
        <Button size="icon" variant="ghost" onClick={onSub}>
          <Minus className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isOver ? "מעבר לזמן" : "מנוחה"}
          </p>
          <p
            className={`text-2xl font-extrabold tabular-nums ${
              isOver ? "text-destructive" : ""
            }`}
          >
            {isOver ? `+${formatClock(overtimeSec)}` : formatClock(remainingSec)}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onSkip}>
          דלג
        </Button>
      </div>
    </div>
  );
}
