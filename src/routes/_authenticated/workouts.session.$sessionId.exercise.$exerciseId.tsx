/**
 * Exercise detail — per-set rows for the active session.
 *
 * - Any row is editable when not yet completed; auto-propagates weight/reps
 *   changes to following unfinished sets (debounced, save on blur).
 * - Tapping ✓ marks the set complete and starts the rest timer.
 * - Tapping a completed row again reverts it to editable.
 * - "+ הוסף סט" always visible; new sets copy the previous set.
 * - Deleting a set during an active workout is immediate (no confirm).
 * - The persistent total-workout timer sits at the bottom.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  Trash2,
  Plus,
  Minus,
  Flame,
  Trophy,
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

  const allSets = setsQ.data ?? [];
  const sets = useMemo(
    () =>
      allSets
        .filter((s) => s.exercise_id === exerciseId)
        .sort((a, b) => a.set_number - b.set_number),
    [allSets, exerciseId],
  );

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
  const bestWeight = Math.max(
    0,
    ...sets.filter((s) => s.completed_at).map((s) => s.weight_kg ?? 0),
  );
  const isPR = bestWeight > 0 && bestWeight > (prQ.data ?? 0);

  const completeAll = () => {
    const pending = sets.filter((s) => !s.completed_at);
    if (pending.length === 0) return;
    pending.forEach((s) => completeMut.mutate(s));
  };

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 pb-40 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            navigate({ to: "/workouts/session/$sessionId", params: { sessionId } })
          }
          aria-label="חזור"
        >
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <p className="text-xs text-muted-foreground">
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

      {/* Set rows */}
      <div className="space-y-2">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>#</span>
          <span>משקל (ק״ג)</span>
          <span>חזרות</span>
          <span />
        </div>
        {(() => {
          const nextPendingId = sets.find((s) => !s.completed_at)?.id ?? null;
          return sets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              isNext={s.id === nextPendingId}
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
          ));
        })()}

        <button
          onClick={() => addMut.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" /> הוסף סט
        </button>

        {doneCount < sets.length && (
          <Button variant="ghost" className="w-full" onClick={completeAll}>
            ביצעתי הכל
          </Button>
        )}
      </div>

      {/* Fixed bottom stack: rest timer + total */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-md space-y-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >

        {rest.active && (
          <RestBar
            phase={rest.phase}
            remainingSec={rest.remainingSec}
            overtimeSec={rest.overtimeSec}
            onAdd={() => rest.addSeconds(15)}
            onSub={() => rest.addSeconds(-15)}
            onSkip={() => rest.clear()}
          />
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

      {/* Prevent unused-var warning in some builds */}
      <span className="hidden">{sessionQ.data?.id}</span>
    </div>
  );
}

/* ---------------- SetRow ---------------- */

function SetRow({
  set,
  isNext,
  onComplete,
  onUncomplete,
  onDelete,
  onChange,
}: {
  set: SessionSet;
  isNext: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onChange: (field: "weight_kg" | "reps", value: number | null) => void;
}) {
  const done = !!set.completed_at;
  const future = !done && !isNext;
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
    ? "border-amber-500/30 bg-muted/40 opacity-90"
    : isNext
      ? "border-primary bg-primary/[0.06] shadow-glow"
      : "border-border bg-card";

  const numberClass = done
    ? "bg-amber-500/15 text-amber-500"
    : isNext
      ? "bg-primary text-primary-foreground"
      : "bg-muted";

  const ctaClass = isNext
    ? "bg-primary text-primary-foreground shadow-glow"
    : "bg-muted text-foreground";

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 rounded-2xl border p-2 transition ${rowClass}`}
    >
      <div className="flex flex-col items-center gap-1">
        <span
          className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${numberClass}`}
        >
          {set.set_number}
        </span>
        {isNext && (
          <span className="sr-only">הסט הבא</span>
        )}
      </div>
      <Input
        inputMode="decimal"
        type="number"
        step="0.5"
        value={w}
        disabled={done}
        onChange={(e) => setW(e.target.value)}
        onBlur={() => commit("weight_kg", w)}
        className="h-11 text-center text-lg font-bold tabular-nums"
      />
      <Input
        inputMode="numeric"
        type="number"
        value={r}
        disabled={done}
        onChange={(e) => setR(e.target.value)}
        onBlur={() => commit("reps", r)}
        className="h-11 text-center text-lg font-bold tabular-nums"
      />
      <div className="flex items-center justify-end gap-1">
        {done ? (
          <button
            onClick={onUncomplete}
            className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-500"
            aria-label="פתח מחדש את הסט"
          >
            <Trophy className="h-5 w-5" />
            <span className="sr-only">הושלם</span>
          </button>
        ) : (
          <button
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
            aria-label="מחק סט"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!done && (
        <div className="col-span-4 flex justify-center">
          <button
            onClick={onComplete}
            className={`mt-1 w-full rounded-xl py-2 text-sm font-bold transition active:scale-[0.98] ${ctaClass} ${
              future ? "opacity-80" : ""
            }`}
            aria-label={isNext ? "ביצעתי את הסט הבא" : "ביצעתי את הסט"}
          >
            {isNext ? "ביצעתי את הסט" : "סמן כבוצע"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Rest bar ---------------- */

function RestBar({
  phase,
  remainingSec,
  overtimeSec,
  onAdd,
  onSub,
  onSkip,
}: {
  phase: "idle" | "running" | "overtime";
  remainingSec: number;
  overtimeSec: number;
  onAdd: () => void;
  onSub: () => void;
  onSkip: () => void;
}) {
  const over = phase === "overtime";
  return (
    <div
      className={`glass-tile flex items-center justify-between gap-2 px-3 py-2 ${
        over ? "border-destructive/50 text-destructive" : "text-foreground"
      }`}
    >
      <button
        onClick={onSub}
        className="grid h-9 w-9 place-items-center rounded-full bg-muted"
        aria-label="פחות 15 שניות"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wider opacity-70">
          {over ? "מעבר לזמן" : "מנוחה"}
        </p>
        <p className="font-mono text-2xl font-extrabold tabular-nums">
          {over ? `+${formatClock(overtimeSec)}` : formatClock(remainingSec)}
        </p>
      </div>
      <button
        onClick={onAdd}
        className="grid h-9 w-9 place-items-center rounded-full bg-muted"
        aria-label="עוד 15 שניות"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        onClick={onSkip}
        className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
      >
        דלג
      </button>
    </div>
  );
}
