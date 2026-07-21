/**
 * /workouts — Workout Home.
 *
 * Sprint fix: reliable start/resume flow.
 *  - Tapping the card body OR the "התחל / המשך" button starts/resumes the
 *    session for that template.
 *  - Editing (day assignment / template) is only reachable via a dedicated
 *    pencil icon that stops propagation.
 *  - A prominent "אימון פעיל" card at the top always resumes the current
 *    in-progress session, no matter which template it belongs to.
 *  - Duplicate starts are blocked (mutation-level guard + DB unique index).
 *  - Trying to start a *different* workout while another is active opens a
 *    conflict modal with continue / finish-previous / cancel.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  ClipboardList,
  History,
  Check,
  ChevronLeft,
  Dumbbell,
  ChartLine,
  Pencil,
  Flame,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import {
  ActiveSessionConflictError,
  discardSession,
  getActiveSession,
  getSessionHealth,
  getWeeklyPlan,
  listSessions,
  setPlanSlot,
  startOrResumeSessionForTemplate,
  WEEKDAY_HE,
  type PlanSlot,
  type SessionRow,
} from "@/lib/workout-session";
import { clearWorkoutTimer } from "@/hooks/useWorkoutTimer";
import { formatTotalTime } from "@/hooks/useWorkoutTimer";

export const Route = createFileRoute("/_authenticated/workouts/")({
  component: WorkoutHome,
});

type Template = { id: string; name: string };

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function WorkoutHome() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<number | null>(null);
  const [conflict, setConflict] = useState<{
    active: SessionRow;
    pending: { templateId: string; name: string };
  } | null>(null);
  const [recovery, setRecovery] = useState<{
    active: SessionRow;
    mode: "stale" | "invalid";
    completedSetCount?: number;
    message?: string;
  } | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });
  const templatesQ = useQuery({
    queryKey: ["workout_templates_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });
  const sessionsQ = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => listSessions(30),
  });
  const activeQ = useQuery({
    queryKey: ["active-session"],
    queryFn: getActiveSession,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const exImagesQ = useQuery({
    queryKey: ["template_hero_images"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_template_exercises")
        .select("template_id, position, exercises(image_path)");
      const map = new Map<string, string>();
      for (const row of (data ?? []) as unknown as {
        template_id: string;
        position: number;
        exercises: { image_path: string | null } | null;
      }[]) {
        if (!map.has(row.template_id) && row.exercises?.image_path) {
          map.set(row.template_id, row.exercises.image_path);
        }
      }
      return map;
    },
  });

  const today = new Date().getDay();
  const bySlot = useMemo(() => {
    const map = new Map<number, PlanSlot>();
    for (const s of planQ.data ?? []) map.set(s.weekday, s);
    return map;
  }, [planQ.data]);

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
  const doneCount = Math.min(doneIds.size, planned.length);
  const progress =
    planned.length > 0 ? Math.round((doneCount / planned.length) * 100) : 0;

  const active = activeQ.data ?? null;
  const activeTemplateId = active?.template_id ?? null;

  const nextWeekday = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      const d = (today + i) % 7;
      const slot = bySlot.get(d);
      if (slot?.template_id && !doneIds.has(slot.template_id)) return d;
    }
    return null;
  }, [today, bySlot, doneIds]);

  const start = useMutation({
    mutationFn: async (slot: PlanSlot) => {
      if (!slot.template_id) throw new Error("אין תבנית ליום זה");
      const tpl = templatesQ.data?.find((x) => x.id === slot.template_id);
      const name = slot.display_name ?? tpl?.name ?? "אימון";
      return {
        templateId: slot.template_id,
        name,
        result: await startOrResumeSessionForTemplate(slot.template_id, name),
      };
    },
    onMutate: (slot) => {
      setPendingTemplateId(slot.template_id ?? null);
    },
    onSettled: () => setPendingTemplateId(null),
    onSuccess: ({ result }) => {
      qc.invalidateQueries({ queryKey: ["active-session"] });
      navigate({
        to: "/workouts/session/$sessionId",
        params: { sessionId: result.sessionId },
      });
    },
    onError: (err: unknown, slot) => {
      if (err instanceof ActiveSessionConflictError && slot.template_id) {
        void openActiveSession(err.active, {
          pending: {
            templateId: slot.template_id,
            name: slot.display_name ?? templatesQ.data?.find((x) => x.id === slot.template_id)?.name ?? "אימון",
          },
        });
        return;
      }
      console.error("[workouts] start failed", err);
      toast.error(
        err instanceof Error && err.message === "NO_TEMPLATE_EXERCISES"
          ? "אין תרגילים באימון הזה — ערוך את התוכנית והוסף לפחות תרגיל אחד"
          : "לא הצלחנו להתחיל את האימון\nנסה שוב בעוד רגע",
      );
    },
  });

  const abandonActive = useMutation({
    mutationFn: async (sessionId: string) => discardSession(sessionId),
    onSuccess: (_r, sessionId) => {
      clearWorkoutTimer(sessionId);
      setConflict(null);
      setRecovery(null);
      qc.invalidateQueries({ queryKey: ["active-session"] });
      qc.invalidateQueries({ queryKey: ["sessions", "recent"] });
    },
    onError: (error) => {
      console.error("[workouts] abandon active failed", error);
      toast.error("לא הצלחנו לסיים את האימון התקוע");
    },
  });

  const openActiveSession = async (
    session: SessionRow,
    options?: { pending?: { templateId: string; name: string }; force?: boolean },
  ) => {
    try {
      const health = await getSessionHealth(session.id);
      if (!health.restorable) {
        setRecovery({ active: session, mode: "invalid", completedSetCount: health.completedSetCount });
        return;
      }
      if (health.stale && !options?.force) {
        setRecovery({ active: health.session ?? session, mode: "stale", completedSetCount: health.completedSetCount });
        return;
      }
      if (options?.pending && session.template_id !== options.pending.templateId) {
        setConflict({ active: session, pending: options.pending });
        return;
      }
      navigate({ to: "/workouts/session/$sessionId", params: { sessionId: session.id } });
    } catch (error) {
      console.error("[workouts] active session validation failed", error);
      setRecovery({ active: session, mode: "invalid", message: "לא הצלחנו לפתוח את האימון הפעיל" });
    }
  };

  const programName = planned.length ? "Full Body" : "ללא תוכנית";
  const heroImage = planned[0]?.template_id
    ? exImagesQ.data?.get(planned[0].template_id!)
    : null;

  return (
    <div dir="rtl" className="space-y-5 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">התוכנית שלך לשבוע</p>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="היסטוריה">
            <Link to="/workouts/history">
              <History className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label={t("workouts.templates")}>
            <Link to="/workout-templates">
              <ClipboardList className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {active && <ActiveSessionCard session={active} onOpen={() => openActiveSession(active)} />}

      <Link
        to="/workouts/program"
        className="relative block overflow-hidden rounded-3xl border border-primary/30 p-5 hero-glow"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" stroke="oklch(1 0 0 / 8%)" strokeWidth="8" fill="none" />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="oklch(0.93 0.24 125)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(progress / 100) * 264} 264`}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 8px oklch(0.93 0.24 125 / 60%))" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-lg font-extrabold tabular-nums">{progress}%</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-primary">תוכנית פעילה</p>
            <p className="truncate text-lg font-extrabold">תוכנית {programName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doneCount} מתוך {planned.length} אימונים השבוע
            </p>
          </div>
          <ChartLine className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">אימוני השבוע</h2>
          <span className="text-xs text-muted-foreground">{WEEKDAY_HE[today]}</span>
        </div>
        <div className="space-y-3">
          {WEEKDAY_HE.map((label, idx) => {
            const slot = bySlot.get(idx);
            const tpl = slot?.template_id
              ? templatesQ.data?.find((x) => x.id === slot.template_id)
              : null;
            const done = slot?.template_id ? doneIds.has(slot.template_id) : false;
            const isNext = idx === nextWeekday;
            const isToday = idx === today;
            const image = slot?.template_id
              ? exImagesQ.data?.get(slot.template_id) ?? heroImage
              : null;
            const isActiveHere =
              !!activeTemplateId && slot?.template_id === activeTemplateId;
            const isPending =
              start.isPending && pendingTemplateId === slot?.template_id;

            const handleCardClick = () => {
              if (!slot?.template_id) {
                setEditing(idx);
                return;
              }
              if (active && slot?.template_id && active.template_id === slot.template_id) {
                void openActiveSession(active);
                return;
              }
              if (start.isPending) return;
              start.mutate(slot);
            };

            return (
              <div
                key={idx}
                role={slot?.template_id ? "button" : undefined}
                tabIndex={slot?.template_id ? 0 : -1}
                onClick={slot?.template_id ? handleCardClick : undefined}
                onKeyDown={
                  slot?.template_id
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleCardClick();
                        }
                      }
                    : undefined
                }
                className={`relative flex items-center gap-3 rounded-3xl border p-3 transition ${
                  slot?.template_id ? "cursor-pointer active:scale-[0.99]" : ""
                } ${
                  isActiveHere
                    ? "border-primary bg-card shadow-glow"
                    : isNext
                      ? "border-primary bg-card shadow-glow"
                      : done
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-border bg-card"
                }`}
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className={`h-full w-full object-cover ${done ? "opacity-40" : ""}`}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-2xl">
                      <Dumbbell className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {done && (
                    <div className="absolute inset-0 grid place-items-center bg-primary/25">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                        <Check className="h-5 w-5" strokeWidth={3} />
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <p
                    className={`text-[11px] uppercase tracking-wider ${
                      isNext || isActiveHere ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    יום {label}
                    {isToday ? " · היום" : ""}
                    {isActiveHere ? " · פעיל" : isNext ? " · הבא" : ""}
                  </p>
                  <p className="truncate text-base font-bold">
                    {tpl?.name ?? slot?.display_name ?? "יום חופש"}
                  </p>
                </div>

                {slot?.template_id ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(idx);
                      }}
                      aria-label="ערוך יום"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {done && !isActiveHere ? (
                      <span className="text-xs font-semibold text-primary">הושלם</span>
                    ) : (
                      <Button
                        size="lg"
                        className="h-[54px] min-w-[96px] px-5 text-[20px] font-extrabold"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (active && active.template_id === slot.template_id) {
                            void openActiveSession(active);
                            return;
                          }
                          if (start.isPending) return;
                          start.mutate(slot);
                        }}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                            מתחיל...
                          </>
                        ) : isActiveHere ? (
                          <>
                            <Play className="ml-1 h-4 w-4" /> המשך
                          </>
                        ) : (
                          <>
                            <Play className="ml-1 h-4 w-4" /> התחל
                          </>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(idx);
                    }}
                  >
                    שיוך
                    <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing !== null && (
        <AssignDialog
          weekday={editing}
          current={bySlot.get(editing) ?? null}
          templates={templatesQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["weekly-plan"] });
          }}
        />
      )}

      {conflict && (
        <ConflictDialog
          active={conflict.active}
          onClose={() => setConflict(null)}
          onContinueActive={() => {
            const id = conflict.active.id;
            setConflict(null);
            navigate({ to: "/workouts/session/$sessionId", params: { sessionId: id } });
          }}
          onFinishActive={() => {
            abandonActive.mutate(conflict.active.id);
          }}
        />
      )}

      {recovery && (
        <RecoveryDialog
          active={recovery.active}
          mode={recovery.mode}
          completedSetCount={recovery.completedSetCount ?? 0}
          message={recovery.message}
          onClose={() => setRecovery(null)}
          onRetry={async () => {
            const activeNow = await getActiveSession();
            if (!activeNow) {
              setRecovery(null);
              await qc.invalidateQueries({ queryKey: ["active-session"] });
              return;
            }
            try {
              const health = await getSessionHealth(activeNow.id);
              if (health.restorable && (!health.stale || recovery.mode === "stale")) {
                setRecovery(null);
                navigate({ to: "/workouts/session/$sessionId", params: { sessionId: activeNow.id } });
              } else {
                setRecovery({ active: activeNow, mode: health.stale ? "stale" : "invalid", completedSetCount: health.completedSetCount, message: "עדיין לא הצלחנו לשחזר את האימון" });
              }
            } catch (error) {
              console.error("[workouts] recovery retry failed", error);
              setRecovery((r) => r ? { ...r, message: "עדיין לא הצלחנו לשחזר את האימון" } : r);
            }
          }}
          onContinue={() => {
            const id = recovery.active.id;
            setRecovery(null);
            navigate({ to: "/workouts/session/$sessionId", params: { sessionId: id } });
          }}
          onAbandon={() => abandonActive.mutate(recovery.active.id)}
          abandoning={abandonActive.isPending}
        />
      )}
    </div>
  );
}

function ActiveSessionCard({ session, onOpen }: { session: SessionRow; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(session.started_at).getTime()) / 1000),
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="block w-full cursor-pointer rounded-3xl border-2 border-primary bg-card p-4 text-right shadow-glow transition active:scale-[0.99]"
      style={{ minHeight: 130 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-primary">
            <Flame className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              אימון פעיל
            </span>
          </div>
          <p className="mt-1 truncate text-[24px] font-extrabold leading-tight">
            {session.name ?? "אימון"}
          </p>
          <p className="mt-1 font-mono text-[30px] font-bold tabular-nums text-primary">
            {formatTotalTime(elapsed)}
          </p>
        </div>
        <Button
          size="lg"
          className="h-[52px] px-5 text-base font-extrabold"
          disabled={pressed}
          onClick={(e) => {
            e.stopPropagation();
            setPressed(true);
            onOpen();
            window.setTimeout(() => setPressed(false), 900);
          }}
        >
          {pressed ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Play className="ml-1 h-4 w-4" />}
          המשך אימון
        </Button>
      </div>
    </div>
  );
}

function ConflictDialog({
  active,
  onClose,
  onContinueActive,
  onFinishActive,
}: {
  active: SessionRow;
  onClose: () => void;
  onContinueActive: () => void;
  onFinishActive: () => void;
}) {
  const startedMs = new Date(active.started_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>יש לך אימון פעיל</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-base font-bold">{active.name ?? "אימון"}</p>
            <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
              {formatTotalTime(elapsed)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="h-12 text-base font-bold" onClick={onContinueActive}>
              המשך אימון פעיל
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base font-bold"
              onClick={onFinishActive}
            >
              סיים את האימון הקודם
            </Button>
            <Button variant="ghost" className="h-12" onClick={onClose}>
              בטל
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryDialog({
  active,
  mode,
  completedSetCount,
  message,
  onClose,
  onRetry,
  onContinue,
  onAbandon,
  abandoning,
}: {
  active: SessionRow;
  mode: "stale" | "invalid";
  completedSetCount: number;
  message?: string;
  onClose: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onAbandon: () => void;
  abandoning: boolean;
}) {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000));
  const startTime = new Date(active.started_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === "stale" ? "מצאנו אימון ישן שלא הסתיים" : "לא הצלחנו לשחזר את האימון הפעיל"}</DialogTitle>
          {mode === "invalid" && (
            <DialogDescription>
              האימון נשמר כסשן פעיל, אך חלק מהנתונים הדרושים לפתיחתו חסרים.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="text-base font-bold">{active.name ?? "אימון"}</p>
            <p className="mt-1 text-muted-foreground">התחלה: {startTime}</p>
            <p className="font-mono text-primary tabular-nums">משך: {formatTotalTime(elapsed)}</p>
            <p className="text-muted-foreground">סטים שהושלמו: {completedSetCount}</p>
          </div>
          {message && <p className="text-sm text-destructive">{message}</p>}
          <div className="flex flex-col gap-2">
            {mode === "stale" ? (
              <Button className="h-12 text-base font-bold" onClick={onContinue}>המשך אימון</Button>
            ) : (
              <Button className="h-12 text-base font-bold" onClick={onRetry}>נסה שוב</Button>
            )}
            <Button variant="outline" className="h-12 text-base font-bold" onClick={onAbandon} disabled={abandoning}>
              {abandoning ? "מסיים..." : mode === "stale" ? "סיים אימון תקוע" : "סיים את האימון התקוע"}
            </Button>
            <Button variant="ghost" className="h-12" onClick={onClose}>בטל</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  weekday,
  current,
  templates,
  onClose,
  onSaved,
}: {
  weekday: number;
  current: PlanSlot | null;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(current?.template_id ?? "");

  const save = useMutation({
    mutationFn: async () => setPlanSlot(weekday, templateId || null, null),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => setPlanSlot(weekday, null, null),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>יום {WEEKDAY_HE[weekday]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="בחר תבנית" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              אין תבניות עדיין —{" "}
              <Link to="/workout-templates" className="text-primary underline">
                צור תבנית
              </Link>
              .
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              שמור
            </Button>
            <Button
              variant="ghost"
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
            >
              נקה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
