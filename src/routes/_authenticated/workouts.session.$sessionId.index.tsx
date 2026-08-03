/**
 * Active Workout — Overview screen (index route under the session layout).
 *
 * Shows every planned exercise grouped by muscle group. Any card is
 * tappable (in any order). Fixed bottom bar holds the persistent
 * total-workout timer + "סיים". The single-exercise focused UI lives at
 * `/workouts/session/$sessionId/exercise/$exerciseId`.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState, useCallback } from "react";
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
import { Check, Trophy, ChevronLeft, ChevronRight, Flame, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  discardSession,
  ensureSessionRestored,
  getPriorPRs,
  type SessionSet,
} from "@/lib/workout-session";
import { useWorkoutTimer, formatTotalTime } from "@/hooks/useWorkoutTimer";
import { normalizeMuscleGroup, MUSCLE_GROUPS, type MuscleGroup } from "@/lib/muscle-groups";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/")({
  component: OverviewPage,
});

type Ex = { id: string; name: string; muscle_group: string | null; image_path?: string | null };

function OverviewPage() {
  const { sessionId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [zeroWarnOpen, setZeroWarnOpen] = useState(false);


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

  // Occurrence order comes from set position; current exercise = first one
  // (by position) that still has an open set.
  const orderedExerciseIds = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...sets].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.set_number - b.set_number,
    )) {
      if (!seen.has(s.exercise_id)) {
        seen.add(s.exercise_id);
        out.push(s.exercise_id);
      }
    }
    return out;
  }, [sets]);

  const currentExerciseId = useMemo(() => {
    for (const id of orderedExerciseIds) {
      const exSets = sets.filter((s) => s.exercise_id === id);
      if (exSets.some((s) => !s.completed_at)) return id;
    }
    return null;
  }, [orderedExerciseIds, sets]);

  const exercisesDone = orderedExerciseIds.filter((id) => {
    const exSets = sets.filter((s) => s.exercise_id === id);
    return exSets.length > 0 && exSets.every((s) => s.completed_at);
  }).length;

  const volumeDone = Math.round(
    sets
      .filter((s) => s.completed_at)
      .reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
  );

  const goToSummary = useCallback(() => {
    setFinishOpen(false);
    setCancelOpen(false);
    setZeroWarnOpen(false);
    navigate({
      to: "/workouts/session/$sessionId/summary",
      params: { sessionId },
    });
  }, [navigate, sessionId]);

  const handleFinish = useCallback(() => {
    setFinishOpen(false);
    if (totalDone === 0) {
      setZeroWarnOpen(true);
      return;
    }
    goToSummary();
  }, [totalDone, goToSummary]);

  const handleTemporaryExit = useCallback(() => {
    // Session stays in_progress; the global bar keeps it reachable.
    qc.invalidateQueries({ queryKey: ["active-session"] });
    navigate({ to: "/workouts" });
  }, [qc, navigate]);

  const handleDiscard = useCallback(async () => {
    try {
      await discardSession(sessionId);
    } catch (e) {
      console.error("[session] discard failed", e);
      toast.error("לא הצלחנו לבטל את האימון");
      return;
    }
    setFinishOpen(false);
    setCancelOpen(false);
    setZeroWarnOpen(false);
    qc.invalidateQueries({ queryKey: ["active-session"] });
    navigate({ to: "/workouts" });
  }, [sessionId, qc, navigate]);


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
    <div dir="rtl" className="space-y-3 pb-[120px] pt-1">
      {/* Header */}
      <div className="space-y-2">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleTemporaryExit}
            aria-label="יציאה זמנית מהאימון"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <h1 className="truncate text-center text-sm font-extrabold">{session.name}</h1>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 font-semibold text-primary"
            onClick={() => setFinishOpen(true)}
          >
            סיום
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-1.5 text-center">
          <HeaderStat label="זמן" value={formatTotalTime(timer.elapsedSec)} mono />
          <HeaderStat label="סטים" value={`${totalDone}/${totalPlanned}`} />
          <HeaderStat label="תרגילים" value={`${exercisesDone}/${orderedExerciseIds.length}`} />
          <HeaderStat label="נפח" value={volumeDone > 0 ? `${volumeDone} ק״ג` : "—"} />
        </div>

        {/* Progress bar */}
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary shadow-glow transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>



      {/* Groups */}
      <div className="space-y-4">
        {groups.map(([muscle, list]) => (
          <section key={muscle} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
                {muscle}
              </h2>
            </div>
            <div className="space-y-1.5">

              {list.map(({ exerciseId, sets: exSets, ex }) => {
                const done = exSets.filter((s) => s.completed_at).length;
                const total = exSets.length;
                const isDone = done === total && total > 0;
                const isCurrent = exerciseId === currentExerciseId;
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
                    className={`relative flex items-center gap-2.5 overflow-hidden rounded-2xl border p-2 transition ${
                      isCurrent
                        ? "border-primary bg-card shadow-glow"
                        : isDone
                          ? "border-border/60 bg-muted/20 opacity-80"
                          : inProgress
                            ? "border-primary/50 bg-card"
                            : "border-border bg-card"
                    }`}
                  >

                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {ex?.image_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ex.image_path}
                          alt=""
                          className={`h-full w-full object-cover ${isDone ? "opacity-40" : ""}`}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-lg">
                          🏋️
                        </div>
                      )}
                      {isDone && (
                        <div className="absolute inset-0 grid place-items-center bg-primary/25">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold">
                          {isCurrent && (
                            <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 align-middle text-[9px] font-bold text-primary">
                              עכשיו
                            </span>
                          )}
                          {ex?.name ?? "—"}
                        </p>

                        {isPR && <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1.5 text-[11px]">
                        <span
                          className={
                            isDone
                              ? "font-semibold text-primary"
                              : inProgress
                                ? "font-medium text-primary"
                                : "text-muted-foreground"
                          }
                        >
                          {done}/{total} סטים
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-extrabold text-primary">
                          {displayWeight != null ? `${displayWeight}` : "—"}
                        </span>
                        <span className="text-muted-foreground">ק״ג</span>
                        <span className="text-muted-foreground">×</span>
                        <span className="font-bold">{displayReps ?? "—"}</span>
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}

            </div>
          </section>
        ))}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                זמן אימון
              </p>
              <p className="font-mono text-base font-bold tabular-nums">
                {formatTotalTime(timer.elapsedSec)}
              </p>
            </div>
          </div>
          <Button className="h-10 min-w-[130px] text-sm" onClick={() => setFinishOpen(true)}>
            סיים אימון
          </Button>


        </div>
      </div>

      {/* Finish menu */}
      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>סיום אימון</AlertDialogTitle>
            <AlertDialogDescription>
              אפשר להמשיך באימון, לסיים ולשמור אותו, או לבטל אותו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>המשך באימון</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinish}>סיום ושמירת האימון</AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setFinishOpen(false);
                setCancelOpen(true);
              }}
            >
              ביטול האימון
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את האימון?</AlertDialogTitle>
            <AlertDialogDescription>
              האימון הפעיל ייסגר ולא ניתן יהיה להמשיך אותו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>חזרה לאימון</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDiscard}
            >
              בטל את האימון
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={zeroWarnOpen} onOpenChange={setZeroWarnOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לא סימנת אף סט</AlertDialogTitle>
            <AlertDialogDescription>
              עדיין אפשר לסיים ולשמור את האימון, או לבטל אותו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>חזרה לאימון</AlertDialogCancel>
            <AlertDialogAction onClick={goToSummary}>סיים בכל זאת</AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setZeroWarnOpen(false);
                setCancelOpen(true);
              }}
            >
              ביטול האימון
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

/* ---------------- Header stat ---------------- */

function HeaderStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-1.5 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={`truncate text-sm font-bold tabular-nums ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
