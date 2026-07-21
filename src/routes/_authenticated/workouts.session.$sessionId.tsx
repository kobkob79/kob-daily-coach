/**
 * Active Workout — Overview screen.
 *
 * Rebuilt for Sprint 2: shows every planned exercise grouped by muscle
 * group. Any card is tappable (in any order). Fixed bottom bar holds the
 * persistent total-workout timer + "סיים". The single-exercise focused UI
 * moved to `/workouts/session/$sessionId/exercise/$exerciseId`.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { X, Check, Trophy, Plus, ChevronLeft, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  discardSession,
  ensureSessionRestored,
  getPriorPRs,
  insertPlannedSet,
  type SessionSet,
} from "@/lib/workout-session";
import { useWorkoutTimer, formatTotalTime } from "@/hooks/useWorkoutTimer";
import { normalizeMuscleGroup, MUSCLE_GROUPS, type MuscleGroup } from "@/lib/muscle-groups";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId")({
  component: OverviewPage,
});

type Ex = { id: string; name: string; muscle_group: string | null; image_path?: string | null };

function OverviewPage() {
  const { sessionId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);

  const restoreQ = useQuery({
    queryKey: ["session_restore", sessionId],
    queryFn: () => ensureSessionRestored(sessionId),
    retry: false,
  });

  const session = restoreQ.data?.session ?? null;
  const timer = useWorkoutTimer(sessionId, session?.started_at, session?.status === "in_progress");
  const sets = restoreQ.data?.sets ?? [];
  const exerciseIds = useMemo(
    () => Array.from(new Set(sets.map((s) => s.exercise_id))),
    [sets],
  );

  const exercisesQ = useQuery({
    enabled: exerciseIds.length > 0,
    queryKey: ["session_exercises", sessionId, exerciseIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,image_path")
        .in("id", exerciseIds);
      if (error) throw error;
      return (data ?? []) as Ex[];
    },
  });

  const priorPRQ = useQuery({
    enabled: exerciseIds.length > 0,
    queryKey: ["session_prior_prs", sessionId, exerciseIds.join(",")],
    queryFn: () => getPriorPRs(exerciseIds, sessionId),
  });

  const exById = useMemo(() => {
    const m = new Map<string, Ex>();
    for (const e of exercisesQ.data ?? []) m.set(e.id, e);
    return m;
  }, [exercisesQ.data]);

  // group exercises by muscle group, preserving insertion order per exercise
  const groups = useMemo(() => {
    const byExercise = new Map<string, SessionSet[]>();
    const order: string[] = [];
    for (const s of sets) {
      if (!byExercise.has(s.exercise_id)) {
        byExercise.set(s.exercise_id, []);
        order.push(s.exercise_id);
      }
      byExercise.get(s.exercise_id)!.push(s);
    }
    for (const arr of byExercise.values()) arr.sort((a, b) => a.set_number - b.set_number);
    const byMuscle = new Map<MuscleGroup, { exerciseId: string; sets: SessionSet[]; ex: Ex | undefined }[]>();
    for (const id of order) {
      const ex = exById.get(id);
      const mg = normalizeMuscleGroup(ex?.muscle_group);
      if (!byMuscle.has(mg)) byMuscle.set(mg, []);
      byMuscle.get(mg)!.push({ exerciseId: id, sets: byExercise.get(id)!, ex });
    }
    return Array.from(byMuscle.entries()).sort(
      (a, b) => MUSCLE_GROUPS.indexOf(a[0]) - MUSCLE_GROUPS.indexOf(b[0]),
    );
  }, [sets, exById]);

  const totalDone = sets.filter((s) => s.completed_at).length;
  const totalPlanned = sets.length;
  const progress = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  const addExerciseMut = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.from("exercises").select("id").limit(1);
      const eid = data?.[0]?.id;
      if (!eid) throw new Error("אין תרגילים בספרייה");
      const pos = (sets[sets.length - 1]?.position ?? 0) + 1;
      await insertPlannedSet({
        sessionId,
        exerciseId: eid,
        position: pos,
        setNumber: 1,
        weightKg: null,
        reps: null,
        plannedRestSec: 90,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_restore", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (restoreQ.isLoading) {
    return (
      <div dir="rtl" className="mx-auto grid min-h-[50vh] max-w-md place-items-center p-6 text-center">
        <div className="space-y-3">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">משחזרת את האימון…</p>
        </div>
      </div>
    );
  }

  if (restoreQ.isError || !session) {
    return (
      <SessionRecoveryScreen
        sessionId={sessionId}
        onRetry={() => restoreQ.refetch()}
        onAbandoned={() => navigate({ to: "/workouts" })}
      />
    );
  }
  if (sets.length === 0) {
    return <SessionRecoveryScreen sessionId={sessionId} onRetry={() => restoreQ.refetch()} onAbandoned={() => navigate({ to: "/workouts" })} />;
  }

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-5 pb-28 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setExitOpen(true)}>
          <X className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {session.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalDone}/{totalPlanned} סטים · {progress}%
          </p>
        </div>
        <div className="w-9" />
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-primary shadow-glow transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Groups */}
      <div className="space-y-6">
        {groups.map(([muscle, list]) => (
          <section key={muscle} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{muscle}</h2>
              <button
                onClick={() => addExerciseMut.mutate()}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20"
                aria-label="הוסף תרגיל"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {list.map(({ exerciseId, sets: exSets, ex }) => {
                const done = exSets.filter((s) => s.completed_at).length;
                const total = exSets.length;
                const isDone = done === total && total > 0;
                const inProgress = done > 0 && !isDone;
                const bestWeight = Math.max(
                  0,
                  ...exSets.filter((s) => s.completed_at).map((s) => s.weight_kg ?? 0),
                );
                const priorPR = priorPRQ.data?.[exerciseId] ?? 0;
                const isPR = bestWeight > 0 && bestWeight > priorPR;
                const firstOpen = exSets.find((s) => !s.completed_at);
                const displayWeight =
                  (firstOpen ?? exSets[0])?.weight_kg ?? null;
                const displayReps = (firstOpen ?? exSets[0])?.reps ?? null;
                return (
                  <Link
                    key={exerciseId}
                    to="/workouts/session/$sessionId/exercise/$exerciseId"
                    params={{ sessionId, exerciseId }}
                    className={`relative flex gap-3 overflow-hidden rounded-3xl border p-3 transition ${
                      isDone
                        ? "border-primary/40 bg-primary/[0.04] opacity-90"
                        : inProgress
                          ? "border-primary bg-card shadow-glow"
                          : "border-border bg-card"
                    }`}
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                      {ex?.image_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ex.image_path}
                          alt=""
                          className={`h-full w-full object-cover ${isDone ? "opacity-40" : ""}`}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-2xl">
                          🏋️
                        </div>
                      )}
                      {isDone && (
                        <div className="absolute inset-0 grid place-items-center bg-primary/25">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                            <Check className="h-6 w-6" strokeWidth={3} />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-base font-bold">{ex?.name ?? "—"}</p>
                        {isPR && <Trophy className="h-4 w-4 shrink-0 text-primary" />}
                      </div>
                      <p
                        className={`mt-0.5 text-xs ${
                          isDone
                            ? "font-semibold text-primary"
                            : inProgress
                              ? "font-medium text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {done} סטים מתוך {total}
                      </p>
                      <div className="mt-2 flex items-baseline gap-2 text-sm">
                        <span className="text-lg font-extrabold text-primary">
                          {displayWeight != null ? `${displayWeight}` : "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">ק״ג</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-bold">
                          {displayReps ?? "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">חזרות</span>
                      </div>
                    </div>
                    <ChevronLeft className="my-auto h-5 w-5 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-md px-4">
        <div className="glass-tile flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                זמן אימון
              </p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {formatTotalTime(timer.elapsedSec)}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            onClick={() =>
              navigate({
                to: "/workouts/session/$sessionId/summary",
                params: { sessionId },
              })
            }
          >
            סיים אימון
          </Button>
        </div>
      </div>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לצאת מהאימון?</AlertDialogTitle>
            <AlertDialogDescription>
              הזמן ממשיך לרוץ ברקע. אפשר להמשיך, לסיים ולשמור, או לזרוק.
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
                timer.stop();
                qc.invalidateQueries({ queryKey: ["active-session"] });
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

function SessionRecoveryScreen({
  sessionId,
  onRetry,
  onAbandoned,
}: {
  sessionId: string;
  onRetry: () => void;
  onAbandoned: () => void;
}) {
  const qc = useQueryClient();
  const abandon = useMutation({
    mutationFn: () => discardSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-session"] });
      qc.invalidateQueries({ queryKey: ["sessions", "recent"] });
      onAbandoned();
    },
    onError: (error) => {
      console.error("[workouts] recovery abandon failed", error);
      toast.error("לא הצלחנו לסיים את האימון התקוע");
    },
  });

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-6 text-center">
      <div className="surface-card space-y-3 p-5">
        <h1 className="text-xl font-extrabold">לא הצלחנו לשחזר את האימון הפעיל</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          האימון נשמר כסשן פעיל, אך חלק מהנתונים הדרושים לפתיחתו חסרים.
        </p>
        <div className="grid gap-2 pt-2">
          <Button className="h-12 font-bold" onClick={onRetry}>
            נסה שוב
          </Button>
          <Button
            variant="outline"
            className="h-12 font-bold"
            onClick={() => abandon.mutate()}
            disabled={abandon.isPending}
          >
            {abandon.isPending ? "מסיים..." : "סיים את האימון התקוע"}
          </Button>
          <Button asChild variant="ghost" className="h-12">
            <Link to="/workouts">בטל</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
