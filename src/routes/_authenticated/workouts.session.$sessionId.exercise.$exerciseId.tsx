/**
 * Exercise detail — the premium per-exercise surface of an active session.
 *
 * Structure (top → bottom):
 *   1. Hero media (video → animation → image → placeholder), resolved
 *      dynamically from Storage — never by hardcoded filename.
 *   2. Exercise header: name, primary muscles, equipment, "תרגיל X מתוך Y".
 *   3. Active set card — accent-highlighted, glowing, elevated, auto-scrolled
 *      into view, with previous-vs-current and big one-handed inputs.
 *   4. The full set list; completed sets stay visible but quieter.
 *   5. A floating, collapsible rest timer that turns RED at zero.
 *
 * Personal records are celebrated inline (non-blocking banner) the moment a
 * set beats weight / reps / volume / estimated 1RM.
 * Nothing here writes to the DB on a tick; the workout timer derives from
 * `started_at`.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Flame,
  Trophy,
  CheckCircle2,
  Play,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { fieldSetForExercise, type ExerciseFieldSet } from "@/lib/exercise-types";
import {
  deleteSet,
  estimate1RM,
  getSession,
  getSessionSets,
  insertPlannedSet,
  replaceExerciseInSession,
  updateSet,
  getExercisePRStats,
  getLastPerformanceByExercise,
  EMPTY_PR_STATS,
  type SessionSet,
} from "@/lib/workout-session";
import { useWorkoutTimer, formatTotalTime } from "@/hooks/useWorkoutTimer";
import { ExerciseHero } from "@/components/workouts/ExerciseHero";
import { ExercisePicker } from "@/components/workouts/ExercisePicker";
import {
  formatPerformance,
  type PreviousPerformance,
} from "@/components/workouts/PreviousVsCurrent";
import { useSessionRestTimer } from "@/components/workouts/RestTimerProvider";
import {
  PRCelebration,
  type PRCelebrationData,
  type PRKind,
} from "@/components/workouts/PRCelebration";

const DEFAULT_REST = 90;

/** Every field a set row can edit, across all exercise types. */
type EditableSetField =
  | "weight_kg"
  | "reps"
  | "duration_seconds"
  | "avg_speed_kmh"
  | "distance_km"
  | "incline_pct"
  | "avg_heart_rate"
  | "max_heart_rate"
  | "recovery_heart_rate"
  | "calories"
  | "cadence"
  | "side"
  | "pain_level";

/**
 * Per-set readings (heart rate, calories, cadence...) and mobility side
 * shouldn't carry forward to future sets the way a working weight or a
 * planned duration should.
 */
const NON_PROPAGATABLE_FIELDS = new Set<EditableSetField>([
  "avg_heart_rate",
  "max_heart_rate",
  "recovery_heart_rate",
  "calories",
  "cadence",
  "side",
  "pain_level",
]);

export const Route = createFileRoute(
  "/_authenticated/workouts/session/$sessionId/exercise/$exerciseId",
)({
  component: ExerciseDetailPage,
});

function ExerciseDetailPage() {
  const { sessionId, exerciseId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const rest = useSessionRestTimer();
  const [finishOpen, setFinishOpen] = useState(false);
  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  const [pr, setPr] = useState<PRCelebrationData | null>(null);
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  /** Measured height of the floating stack, so content never hides beneath it. */
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const [floatingHeight, setFloatingHeight] = useState(120);

  useEffect(() => {
    const el = floatingRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFloatingHeight(el.offsetHeight));
    ro.observe(el);
    setFloatingHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);


  const sessionQ = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
  });
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
        .select("id,name,muscle_group,equipment,image_path,description")
        .eq("id", exerciseId)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        muscle_group: string | null;
        equipment: string | null;
        image_path: string | null;
        description: string | null;
      } | null;
    },
  });
  /** Records set BEFORE this session — the bar the athlete is measured against. */
  const prQ = useQuery({
    queryKey: ["exercise_pr_stats", exerciseId, sessionId],
    queryFn: () => getExercisePRStats(exerciseId, sessionId),
  });
  /** Same exercise, most recent completed session — for "previous vs current". */
  const prevQ = useQuery({
    queryKey: ["exercise_last_performance", exerciseId],
    queryFn: () => getLastPerformanceByExercise(exerciseId),
  });

  const fieldSet = fieldSetForExercise(exQ.data?.muscle_group, exQ.data?.equipment);
  const isTimed = fieldSet !== "strength";

  const prStats = prQ.data ?? EMPTY_PR_STATS;
  const previousBySetNumber = useMemo(() => {
    const map = new Map<number, PreviousPerformance>();
    for (const s of prevQ.data ?? []) {
      map.set(s.set_number, {
        weightKg: s.weight_kg,
        reps: s.reps,
        durationSec: s.duration_seconds,
      });
    }
    return map;
  }, [prevQ.data]);

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

  const exerciseIndex = orderedExerciseIds.indexOf(exerciseId) + 1;
  const exerciseTotal = orderedExerciseIds.length;

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

  /** Which records a just-completed set beat. */
  const detectSetPRs = useCallback(
    (s: SessionSet): PRKind[] => {
      if (isTimed) {
        const duration = s.duration_seconds ?? 0;
        return duration > 0 && duration > prStats.durationSec ? ["duration"] : [];
      }
      const w = s.weight_kg ?? 0;
      const r = s.reps ?? 0;
      if (w <= 0 && r <= 0) return [];
      const kinds: PRKind[] = [];
      if (w > 0 && w > prStats.weightKg) kinds.push("weight");
      if (r > 0 && r > prStats.reps) kinds.push("reps");
      if (w * r > 0 && w * r > prStats.volumeKg) kinds.push("volume");
      if (estimate1RM(w, r) > prStats.e1rmKg && estimate1RM(w, r) > 0) kinds.push("e1rm");
      return kinds;
    },
    [prStats, isTimed],
  );

  /** Short Hebrew detail line for the PR celebration banner. */
  const formatPRDetail = useCallback(
    (s: SessionSet): string =>
      isTimed
        ? `${Math.round((s.duration_seconds ?? 0) / 60)} דק'`
        : `${s.weight_kg ?? "—"} ק״ג × ${s.reps ?? "—"}`,
    [isTimed],
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
      qc.invalidateQueries({ queryKey: ["active-session-current"] });

      const kinds = detectSetPRs(s);
      if (kinds.length > 0) {
        setPr({
          kinds,
          detail: formatPRDetail(s),
          id: `${s.id}-${Date.now()}`,
        });
        try {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            (navigator as Navigator).vibrate?.([40, 60, 40]);
          }
        } catch {
          /* ignore */
        }
      }

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
      propagate?: {
        field: EditableSetField;
        value: number | string | null;
        fromSetNumber: number;
      };
      /** The set as it looked before the edit — used for live PR recalculation. */
      source?: SessionSet;
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
    onSuccess: (_r, vars) => {
      // Live recalculation: sets → volume/stats, PR stats, AI/summary surfaces.
      qc.invalidateQueries({ queryKey: ["session_sets", sessionId] });
      qc.invalidateQueries({ queryKey: ["active-session-current"] });
      qc.invalidateQueries({ queryKey: ["exercise_pr_stats", exerciseId, sessionId] });
      qc.invalidateQueries({ queryKey: ["session_summary", sessionId] });

      // Editing a completed set may create a brand-new record → award it now.
      const source = vars.source;
      if (source?.completed_at) {
        const edited = { ...source, ...vars.patch } as SessionSet;
        const kinds = detectSetPRs(edited);
        if (kinds.length > 0) {
          setPr({
            kinds,
            detail: formatPRDetail(edited),
            id: `${edited.id}-${Date.now()}`,
          });
        }
      }
    },
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
        weightKg: isTimed ? null : (last?.weight_kg ?? null),
        reps: isTimed ? null : (last?.reps ?? null),
        durationSeconds: isTimed ? (last?.duration_seconds ?? null) : null,
        plannedRestSec: last?.planned_rest_seconds ?? DEFAULT_REST,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => deleteSet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", sessionId] }),
  });

  /**
   * Swap this exercise for a different one, for this session only — the
   * template it came from is never touched, so the original exercise is
   * back automatically next workout.
   */
  const replaceMut = useMutation({
    mutationFn: (newExerciseId: string) =>
      replaceExerciseInSession(sessionId, exerciseId, newExerciseId),
    onSuccess: (_r, newExerciseId) => {
      qc.invalidateQueries({ queryKey: ["session_sets", sessionId] });
      toast.success("התרגיל הוחלף לאימון הזה");
      navigate({
        to: "/workouts/session/$sessionId/exercise/$exerciseId",
        params: { sessionId, exerciseId: newExerciseId },
        replace: true,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * The workout is a live draft: sets stay editable while the session is
   * in progress and lock only once the workout itself is finished.
   */
  const locked = !!sessionQ.data && sessionQ.data.status !== "in_progress";

  const doneCount = sets.filter((s) => s.completed_at).length;

  const remaining = sets.length - doneCount;
  const activeSet = sets.find((s) => !s.completed_at) ?? null;
  const exerciseVolume = Math.round(
    sets
      .filter((s) => s.completed_at)
      .reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
  );
  const exerciseDurationSec = sets
    .filter((s) => s.completed_at)
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const bestWeight = Math.max(
    0,
    ...sets.filter((s) => s.completed_at).map((s) => s.weight_kg ?? 0),
  );
  const bestDurationSec = Math.max(
    0,
    ...sets.filter((s) => s.completed_at).map((s) => s.duration_seconds ?? 0),
  );
  const isPR = isTimed
    ? bestDurationSec > 0 && bestDurationSec > prStats.durationSec
    : bestWeight > 0 && bestWeight > prStats.weightKg;

  const scrollToActive = useCallback(() => {
    activeCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  // Keep the active set in view whenever it changes.
  useEffect(() => {
    if (!activeSet) return;
    const id = window.setTimeout(scrollToActive, 220);
    return () => window.clearTimeout(id);
  }, [activeSet?.id, scrollToActive]);

  // Publish optional set context + skip behaviour to the session-level timer.
  const { setSetContext, registerSkipHandler } = rest;
  useEffect(() => {
    setSetContext({ nextSetNumber: activeSet?.set_number ?? null, totalSets: sets.length });
  }, [activeSet?.set_number, sets.length, setSetContext]);
  useEffect(() => {
    registerSkipHandler(scrollToActive);
    return () => registerSkipHandler(null);
  }, [registerSkipHandler, scrollToActive]);

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

  const progressPct = sets.length > 0 ? Math.round((doneCount / sets.length) * 100) : 0;
  const hasPrevRecord = isTimed
    ? prStats.durationSec > 0
    : prStats.weightKg > 0 || prStats.reps > 0;

  /**
   * Header meta: live progress, personal-record badge and the previous-vs-current
   * summary — everything the athlete needs without scrolling.
   */
  const headerMeta = (
    <div className="space-y-1.5">
      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>התקדמות בתרגיל</span>
          <span className="font-bold tabular-nums text-foreground">
            {doneCount}/{sets.length} סטים
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/50">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {hasPrevRecord && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            <Trophy className="h-3 w-3" />
            שיא אישי{" "}
            {isTimed
              ? `${Math.round(prStats.durationSec / 60)} דק'`
              : prStats.weightKg > 0
                ? `${prStats.weightKg} ק״ג`
                : `${prStats.reps} חזרות`}
          </span>
          {!isTimed && prStats.e1rmKg > 0 && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              1RM משוער {prStats.e1rmKg} ק״ג
            </span>
          )}
        </div>
      )}

      {activeSet && (
        <p className="text-[10px] text-muted-foreground">
          סט {activeSet.set_number} · קודם:{" "}
          <span className="font-bold text-foreground">
            {formatPerformance(previousBySetNumber.get(activeSet.set_number) ?? null) ??
              "ניסיון ראשון"}
          </span>
        </p>
      )}

    </div>
  );


  return (
    <div
      dir="rtl"
      className="mx-auto max-w-md space-y-2.5 pt-1"
      style={{ paddingBottom: floatingHeight + 16 }}
    >

      <PRCelebration data={pr} onDismiss={() => setPr(null)} />

      {/* Header */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={backToOverview}
          aria-label="חזרה לסקירת האימון"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <p className="truncate text-center text-[11px] text-muted-foreground">
          {doneCount}/{sets.length} סטים
        </p>
        {remaining > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary"
            onClick={() => setReplacePickerOpen(true)}
            disabled={replaceMut.isPending}
            aria-label="החלף תרגיל לאימון הזה בלבד"
            title="החלף תרגיל (לאימון הזה בלבד)"
          >
            <Repeat className="h-4 w-4" />
          </Button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      <ExercisePicker
        open={replacePickerOpen}
        onClose={() => setReplacePickerOpen(false)}
        onSelect={(id) => replaceMut.mutate(id)}
        title="החלף תרגיל (לאימון הזה בלבד)"
      />

      <ExerciseHero
        exerciseId={exerciseId}
        name={exQ.data?.name}
        muscleGroup={exQ.data?.muscle_group}
        equipment={exQ.data?.equipment}
        exerciseIndex={exerciseIndex > 0 ? exerciseIndex : null}
        exerciseTotal={exerciseTotal || null}
        fallbackImage={exQ.data?.image_path}
        titleAdornment={isPR ? <Trophy className="h-5 w-5 shrink-0 text-primary" /> : null}
        footer={headerMeta}
      />

      {/* Set table — the single source of truth for the active set */}
      <div className="space-y-1.5">
        {fieldSet === "cardio" ? (
          <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>זמן (דק׳)</span>
            <span>מהירות (קמ״ש)</span>
            <span />
          </div>
        ) : fieldSet === "core" ? (
          <div className="grid grid-cols-[2rem_1fr_3rem] items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>זמן (דק׳)</span>
            <span />
          </div>
        ) : fieldSet === "stretch" ? (
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_3rem] items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>זמן (דק׳)</span>
            <span>צד</span>
            <span>כאב</span>
            <span />
          </div>
        ) : (
          <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>#</span>
            <span>משקל (ק״ג)</span>
            <span>חזרות</span>
            <span />
          </div>
        )}

        {sets.map((s) => (
          <SetRow
            key={s.id}
            containerRef={s.id === activeSet?.id ? activeCardRef : undefined}
            set={s}
            isActive={s.id === activeSet?.id}
            locked={locked}
            fieldSet={fieldSet}
            restActive={s.id === activeSet?.id && rest.active}
            onStartSet={() => rest.clear()}
            previous={previousBySetNumber.get(s.set_number) ?? null}
            onComplete={() => completeMut.mutate(s)}
            onUncomplete={() => uncompleteMut.mutate(s)}
            onDelete={() => removeMut.mutate(s.id)}
            onChange={(field, value) =>
              patchMut.mutate({
                id: s.id,
                patch: { [field]: value } as Partial<SessionSet>,
                source: s,
                propagate:
                  s.completed_at || NON_PROPAGATABLE_FIELDS.has(field)
                    ? undefined
                    : { field, value, fromSetNumber: s.set_number },
              })
            }
          />
        ))}


        <button
          onClick={() => addMut.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> הוסף סט
        </button>
      </div>

      {/* Primary action: finish the active set, directly below the table.
          While a rest timer is running, the athlete must tap ▶ on the set
          itself first — that's the "I'm starting now" signal. */}
      {activeSet ? (
        <Button
          className="h-12 w-full text-base font-extrabold shadow-glow-accent"
          onClick={() => completeMut.mutate(activeSet)}
          disabled={completeMut.isPending || rest.active}
        >
          <CheckCircle2 className="ml-1 h-5 w-5" />
          {rest.active ? "לחץ ▶ כדי להתחיל" : `סיימתי סט ${activeSet.set_number}`}
        </Button>
      ) : (
        <div className="rounded-2xl border border-primary bg-primary/[0.06] p-3 shadow-glow">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-extrabold">התרגיל הושלם</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doneCount} סטים
            {isTimed
              ? exerciseDurationSec > 0
                ? ` · ${Math.round(exerciseDurationSec / 60)} דק'`
                : ""
              : exerciseVolume > 0
                ? ` · נפח ${exerciseVolume} ק״ג`
                : ""}
          </p>
          {nextExerciseId && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              הבא: <span className="font-bold text-foreground">{nextExQ.data ?? "…"}</span>
            </p>
          )}
          <div className="mt-2 grid gap-2">
            {nextExerciseId && (
              <Button className="h-11 font-bold" onClick={goToNextExercise}>
                לתרגיל הבא
              </Button>
            )}
            <Button variant="outline" className="h-11 font-bold" onClick={backToOverview}>
              חזרה לסקירת האימון
            </Button>
          </div>
        </div>
      )}


      {/* Floating stack: finish exercise → workout clock */}
      <div
        ref={floatingRef}
        className="fixed inset-x-0 z-30 mx-auto max-w-md space-y-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >


        {doneCount > 0 && activeSet && (
          <button
            onClick={handleFinishExercise}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-card/90 text-sm font-bold text-foreground backdrop-blur-xl transition active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4 w-4 text-primary" />
            סיימתי תרגיל
          </button>
        )}
        <div className="glass-tile flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
    </div>
  );
}

/* ---------------- SetRow ---------------- */

function SetRow({
  containerRef,
  set,
  isActive,
  locked,
  fieldSet,
  restActive,
  onStartSet,
  previous,
  onComplete,
  onUncomplete,
  onDelete,
  onChange,
}: {
  containerRef?: React.RefObject<HTMLDivElement | null>;
  set: SessionSet;
  isActive: boolean;
  /** True once the workout is finished — only then do sets become read-only. */
  locked: boolean;
  /** Which fields this exercise logs by. */
  fieldSet: ExerciseFieldSet;
  /** This is the active set and a rest timer is currently counting down/over. */
  restActive: boolean;
  /** Dismisses the rest timer immediately — "I'm starting this set now." */
  onStartSet: () => void;
  previous: PreviousPerformance | null;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onChange: (field: EditableSetField, value: number | string | null) => void;
}) {
  const done = !!set.completed_at;
  const disabled = locked || restActive;

  const [w, setW] = useState<string>(set.weight_kg?.toString() ?? "");
  const [r, setR] = useState<string>(set.reps?.toString() ?? "");
  const [durationMin, setDurationMin] = useState<string>(
    set.duration_seconds != null ? String(Math.round(set.duration_seconds / 60)) : "",
  );
  const [speed, setSpeed] = useState<string>(set.avg_speed_kmh?.toString() ?? "");
  const [side, setSide] = useState<string>(set.side ?? "");
  const [painLevel, setPainLevel] = useState<string>(set.pain_level ?? "");
  const initial = useRef({
    w: set.weight_kg,
    r: set.reps,
    durationSec: set.duration_seconds,
    speed: set.avg_speed_kmh,
  });

  // Rehydrate when parent sets change (propagation)
  useEffect(() => {
    setW(set.weight_kg?.toString() ?? "");
    setR(set.reps?.toString() ?? "");
    setDurationMin(
      set.duration_seconds != null ? String(Math.round(set.duration_seconds / 60)) : "",
    );
    setSpeed(set.avg_speed_kmh?.toString() ?? "");
    setSide(set.side ?? "");
    setPainLevel(set.pain_level ?? "");
    initial.current = {
      w: set.weight_kg,
      r: set.reps,
      durationSec: set.duration_seconds,
      speed: set.avg_speed_kmh,
    };
  }, [
    set.weight_kg,
    set.reps,
    set.duration_seconds,
    set.avg_speed_kmh,
    set.side,
    set.pain_level,
    set.id,
  ]);

  const commit = (field: "weight_kg" | "reps", raw: string) => {
    const value = raw === "" ? null : Number(raw);
    if (Number.isNaN(value as number)) return;
    if (field === "weight_kg" && value === initial.current.w) return;
    if (field === "reps" && value === initial.current.r) return;
    onChange(field, value);
  };

  const commitDuration = (raw: string) => {
    const minutes = raw === "" ? null : Number(raw);
    if (Number.isNaN(minutes as number)) return;
    const seconds = minutes == null ? null : Math.round(minutes * 60);
    if (seconds === initial.current.durationSec) return;
    onChange("duration_seconds", seconds);
  };

  const commitSpeed = (raw: string) => {
    const value = raw === "" ? null : Number(raw);
    if (Number.isNaN(value as number)) return;
    if (value === initial.current.speed) return;
    onChange("avg_speed_kmh", value);
  };

  const rowClass = done
    ? "border-primary/30 bg-muted/30"
    : isActive
      ? "border-accent/70 bg-accent/[0.06] shadow-glow-accent"
      : "border-border bg-card";

  const numberClass = done
    ? "bg-primary/15 text-primary"
    : isActive
      ? "bg-accent text-accent-foreground"
      : "bg-muted";

  const prevText = formatPerformance(previous) ?? "ניסיון ראשון";

  const gridClass =
    fieldSet === "core"
      ? restActive
        ? "grid-cols-[2.75rem_1fr_3rem]"
        : "grid-cols-[2rem_1fr_3rem]"
      : fieldSet === "stretch"
        ? restActive
          ? "grid-cols-[2.75rem_1fr_1fr_1fr_3rem]"
          : "grid-cols-[2rem_1fr_1fr_1fr_3rem]"
        : restActive
          ? "grid-cols-[2.75rem_1fr_1fr_3rem]"
          : "grid-cols-[2rem_1fr_1fr_3rem]";

  const selectClass =
    "h-9 min-w-0 rounded-md border border-input bg-transparent px-1 text-center text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      ref={containerRef}
      className={`scroll-mt-24 rounded-xl border p-1.5 transition-all duration-300 ${rowClass} ${
        isActive ? "scale-[1.01]" : ""
      }`}

    >
      <div className={`grid items-center gap-2 ${gridClass}`}>
        {restActive ? (
          <button
            onClick={onStartSet}
            className="animate-soft-pulse flex h-7 items-center justify-center gap-0.5 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground shadow-glow-accent"
            aria-label={`התחל סט ${set.set_number} — עוצר את הטיימר`}
            title="התחל סט — עוצר את הטיימר"
          >
            <Play className="h-3 w-3 fill-current" />
            {set.set_number}
          </button>
        ) : (
          <span
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${numberClass}`}
          >
            {set.set_number}
          </span>
        )}

        {fieldSet === "strength" && (
          <>
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              value={w}
              disabled={disabled}
              onChange={(e) => setW(e.target.value)}
              onBlur={() => commit("weight_kg", w)}
              className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
            />
            <Input
              inputMode="numeric"
              type="number"
              value={r}
              disabled={disabled}
              onChange={(e) => setR(e.target.value)}
              onBlur={() => commit("reps", r)}
              className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
            />
          </>
        )}

        {fieldSet === "cardio" && (
          <>
            <Input
              inputMode="numeric"
              type="number"
              placeholder="דק׳"
              value={durationMin}
              disabled={disabled}
              onChange={(e) => setDurationMin(e.target.value)}
              onBlur={() => commitDuration(durationMin)}
              className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
            />
            <Input
              inputMode="decimal"
              type="number"
              step="0.1"
              placeholder="קמ״ש"
              value={speed}
              disabled={disabled}
              onChange={(e) => setSpeed(e.target.value)}
              onBlur={() => commitSpeed(speed)}
              className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
            />
          </>
        )}

        {fieldSet === "core" && (
          <Input
            inputMode="numeric"
            type="number"
            placeholder="דק׳"
            value={durationMin}
            disabled={disabled}
            onChange={(e) => setDurationMin(e.target.value)}
            onBlur={() => commitDuration(durationMin)}
            className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
          />
        )}

        {fieldSet === "stretch" && (
          <>
            <Input
              inputMode="numeric"
              type="number"
              placeholder="דק׳"
              value={durationMin}
              disabled={disabled}
              onChange={(e) => setDurationMin(e.target.value)}
              onBlur={() => commitDuration(durationMin)}
              className="h-9 min-w-0 text-center text-sm font-bold tabular-nums"
            />
            <select
              value={side}
              disabled={disabled}
              onChange={(e) => {
                setSide(e.target.value);
                onChange("side", e.target.value === "" ? null : e.target.value);
              }}
              className={selectClass}
            >
              <option value="">—</option>
              <option value="left">שמאל</option>
              <option value="right">ימין</option>
              <option value="both">שני הצדדים</option>
            </select>
            <select
              value={painLevel}
              disabled={disabled}
              onChange={(e) => {
                setPainLevel(e.target.value);
                onChange("pain_level", e.target.value === "" ? null : e.target.value);
              }}
              className={selectClass}
            >
              <option value="">—</option>
              <option value="none">אין</option>
              <option value="mild">קל</option>
              <option value="significant">משמעותי</option>
            </select>
          </>
        )}

        <div className="flex items-center justify-end gap-1">
          {done ? (
            <button
              onClick={onUncomplete}
              disabled={locked}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary disabled:opacity-60"
              aria-label="פתח מחדש את הסט (הושלם)"
              title="הושלם — פתח מחדש"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          ) : locked ? null : isActive ? (
            <button
              onClick={onDelete}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              aria-label="מחק סט"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
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

      {fieldSet === "cardio" && (
        <CardioExtraMetrics set={set} disabled={disabled} onChange={onChange} />
      )}

      {!done ? (
        <p className="mt-0.5 px-1 text-[9px] text-muted-foreground">קודם: {prevText}</p>
      ) : !locked ? (
        <p className="mt-0.5 px-1 text-[9px] text-muted-foreground">
          הושלם · ניתן לעריכה עד סיום האימון
        </p>
      ) : null}

    </div>
  );
}

/* ---------------- CardioExtraMetrics ---------------- */

/**
 * Optional manual metrics for a cardio set — distance, incline, heart rate,
 * calories, cadence. Collapsed by default so the row stays scannable; this
 * is the groundwork the sprint's "smartwatch architecture" asked for — a
 * future wearable integration can fill these in without any schema change.
 */
function CardioExtraMetrics({
  set,
  disabled,
  onChange,
}: {
  set: SessionSet;
  disabled: boolean;
  onChange: (field: EditableSetField, value: number | string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasValues =
    set.distance_km != null ||
    set.incline_pct != null ||
    set.avg_heart_rate != null ||
    set.max_heart_rate != null ||
    set.calories != null ||
    set.cadence != null ||
    set.recovery_heart_rate != null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        מדדים נוספים{hasValues && !open ? " •" : ""}
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 px-1">
          <MetricField
            label="מרחק (ק״מ)"
            value={set.distance_km}
            disabled={disabled}
            onCommit={(v) => onChange("distance_km", v)}
          />
          <MetricField
            label="שיפוע (%)"
            value={set.incline_pct}
            disabled={disabled}
            onCommit={(v) => onChange("incline_pct", v)}
          />
          <MetricField
            label="דופק ממוצע"
            value={set.avg_heart_rate}
            disabled={disabled}
            onCommit={(v) => onChange("avg_heart_rate", v)}
          />
          <MetricField
            label="דופק מקס׳"
            value={set.max_heart_rate}
            disabled={disabled}
            onCommit={(v) => onChange("max_heart_rate", v)}
          />
          <MetricField
            label="דופק התאוששות"
            value={set.recovery_heart_rate}
            disabled={disabled}
            onCommit={(v) => onChange("recovery_heart_rate", v)}
          />
          <MetricField
            label="קלוריות"
            value={set.calories}
            disabled={disabled}
            onCommit={(v) => onChange("calories", v)}
          />
          <MetricField
            label="קדנס"
            value={set.cadence}
            disabled={disabled}
            onCommit={(v) => onChange("cadence", v)}
          />
        </div>
      )}
    </div>
  );
}

/** A small labeled numeric field that commits on blur, for the optional metrics grid. */
function MetricField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [local, setLocal] = useState<string>(value?.toString() ?? "");
  const initial = useRef(value);

  useEffect(() => {
    setLocal(value?.toString() ?? "");
    initial.current = value;
  }, [value]);

  const commit = () => {
    const v = local === "" ? null : Number(local);
    if (Number.isNaN(v as number)) return;
    if (v === initial.current) return;
    onCommit(v);
  };

  return (
    <label className="space-y-0.5">
      <span className="block text-[9px] text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        type="number"
        step="any"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        className="h-8 min-w-0 text-center text-xs font-bold tabular-nums"
      />
    </label>
  );
}

