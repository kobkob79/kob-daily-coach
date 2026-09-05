/**
 * /workouts — Workout Hub (VIORA-WORKOUT-NAV-004).
 *
 * One question only: "what should I do now?"
 *  - Active session  -> big Resume card (primary action).
 *  - Otherwise       -> big Next Workout card (primary action).
 *  - Below           -> upcoming planned workouts ONLY.
 *
 * Not here anymore: weekly editing (moved to /workouts/program) and
 * completed workouts / history (moved to /workouts/history).
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  CalendarDays,
  Dumbbell,
  Clock,
  Flame,
  Loader2,
  Library,
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
  startOrResumeSessionForTemplate,
  WEEKDAY_HE,
  type PlanSlot,
  type SessionRow,
} from "@/lib/workout-session";
import { matchSessionsToSlots, startOfWeek } from "@/lib/workout-occurrence";
import { clearWorkoutTimer, formatTotalTime } from "@/hooks/useWorkoutTimer";

export const Route = createFileRoute("/_authenticated/workouts/")({
  component: WorkoutHub,
});

type Template = { id: string; name: string };
type TemplateMeta = { exercises: number; sets: number; focus: string | null };

interface Upcoming {
  weekday: number;
  date: Date;
  slot: PlanSlot;
  name: string;
  meta: TemplateMeta | undefined;
}

function dateForOffset(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function estimateMinutes(meta: TemplateMeta | undefined): number | null {
  if (!meta || meta.sets <= 0) return null;
  return Math.max(15, Math.round((meta.sets * 3.5) / 5) * 5);
}

function workoutLetter(name: string): "A" | "B" | "C" | null {
  const match = name.match(/(?:^|[\s(/-])([abc])(?:$|[\s)/-])/i);
  return match ? (match[1]!.toUpperCase() as "A" | "B" | "C") : null;
}

function WorkoutHub() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [conflict, setConflict] = useState<{ active: SessionRow } | null>(null);
  const [recovery, setRecovery] = useState<{
    active: SessionRow;
    mode: "stale" | "invalid";
    completedSetCount?: number;
    message?: string;
  } | null>(null);
  const [pendingWeekday, setPendingWeekday] = useState<number | null>(null);

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
  const metaQ = useQuery({
    queryKey: ["template_meta"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_template_exercises")
        .select("template_id, target_sets, exercises(muscle_group,category)");
      const map = new Map<string, TemplateMeta>();
      const groupsByTemplate = new Map<string, Map<string, number>>();
      for (const row of (data ?? []) as unknown as {
        template_id: string;
        target_sets: number | null;
        exercises: { muscle_group: string | null; category: string | null } | null;
      }[]) {
        const cur = map.get(row.template_id) ?? { exercises: 0, sets: 0, focus: null };
        cur.exercises += 1;
        cur.sets += row.target_sets ?? 3;
        map.set(row.template_id, cur);

        const group = row.exercises?.muscle_group ?? row.exercises?.category;
        if (group) {
          const groups = groupsByTemplate.get(row.template_id) ?? new Map<string, number>();
          groups.set(group, (groups.get(group) ?? 0) + 1);
          groupsByTemplate.set(row.template_id, groups);
        }
      }
      for (const [templateId, groups] of groupsByTemplate) {
        const meta = map.get(templateId);
        if (!meta) continue;
        const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
        meta.focus = top.length ? top.map(([group]) => group).join(" · ") : null;
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
  const active = activeQ.data ?? null;

  const match = useMemo(() => {
    const sessions = [...(sessionsQ.data ?? [])];
    if (active && !sessions.some((s) => s.id === active.id)) sessions.unshift(active);
    return matchSessionsToSlots(planQ.data ?? [], sessions, weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planQ.data, sessionsQ.data, active, weekStart.getTime()]);

  /** Upcoming = planned days from today forward, skipping done/active ones. */
  const upcoming: Upcoming[] = useMemo(() => {
    const out: Upcoming[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const weekday = (today + offset) % 7;
      const slot = bySlot.get(weekday);
      if (!slot?.template_id) continue; // empty weekdays never appear
      if (match.completedByWeekday.has(weekday)) continue; // no completed here
      if (match.activeWeekday === weekday) continue; // shown as the resume card
      const tpl = templatesQ.data?.find((x) => x.id === slot.template_id);
      out.push({
        weekday,
        date: dateForOffset(offset),
        slot,
        name: slot.display_name ?? tpl?.name ?? "אימון",
        meta: metaQ.data?.get(slot.template_id),
      });
    }
    return out;
  }, [today, bySlot, match, templatesQ.data, metaQ.data]);

  const start = useMutation({
    mutationFn: async (slot: PlanSlot) => {
      if (!slot.template_id) throw new Error("אין תבנית ליום זה");
      const tpl = templatesQ.data?.find((x) => x.id === slot.template_id);
      const name = slot.display_name ?? tpl?.name ?? "אימון";
      return startOrResumeSessionForTemplate(slot.template_id, name, slot.weekday);
    },
    onMutate: (slot) => setPendingWeekday(slot.weekday),
    onSettled: () => setPendingWeekday(null),
    onSuccess: ({ sessionId }) => {
      qc.invalidateQueries({ queryKey: ["active-session"] });
      navigate({ to: "/workouts/session/$sessionId", params: { sessionId } });
    },
    onError: (err: unknown) => {
      if (err instanceof ActiveSessionConflictError) {
        setConflict({ active: err.active });
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

  const openActiveSession = async (session: SessionRow, options?: { force?: boolean }) => {
    try {
      const health = await getSessionHealth(session.id);
      if (!health.restorable) {
        setRecovery({
          active: session,
          mode: "invalid",
          completedSetCount: health.completedSetCount,
        });
        return;
      }
      if (health.stale && !options?.force) {
        setRecovery({
          active: health.session ?? session,
          mode: "stale",
          completedSetCount: health.completedSetCount,
        });
        return;
      }
      navigate({ to: "/workouts/session/$sessionId", params: { sessionId: session.id } });
    } catch (error) {
      console.error("[workouts] active session validation failed", error);
      setRecovery({ active: session, mode: "invalid", message: "לא הצלחנו לפתוח את האימון הפעיל" });
    }
  };

  const primaryNext = !active ? upcoming[0] : undefined;
  const secondary = active ? upcoming : upcoming.slice(1);
  const loading = planQ.isLoading || templatesQ.isLoading || activeQ.isLoading;

  return (
    <div dir="rtl" className="space-y-5 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">מה עושים עכשיו</p>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={t("workouts.templates")}>
            <Link to="/workout-templates">
              <ClipboardList className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <nav aria-label="ניווט אימונים" className="grid grid-cols-3 gap-2">
        <Link
          to="/workouts/program"
          className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-2 text-foreground transition duration-150 active:scale-95 active:bg-primary/15 dark:border-primary/25 dark:bg-primary/[0.09] dark:active:bg-primary/20"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-xs font-bold">שבועי</span>
        </Link>
        <Link
          to="/history"
          search={{ tab: "workouts" }}
          className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-2 text-foreground transition duration-150 active:scale-95 active:bg-primary/15 dark:border-primary/25 dark:bg-primary/[0.09] dark:active:bg-primary/20"
        >
          <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-xs font-bold">היסטוריה</span>
        </Link>
        <Link
          to="/exercises"
          className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-2 text-foreground transition duration-150 active:scale-95 active:bg-primary/15 dark:border-primary/25 dark:bg-primary/[0.09] dark:active:bg-primary/20"
        >
          <Library className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-xs font-bold">מאגר</span>
        </Link>
      </nav>

      {/* Primary action */}
      {active ? (
        <ActiveSessionCard session={active} onOpen={() => openActiveSession(active)} />
      ) : primaryNext ? (
        <NextWorkoutCard
          item={primaryNext}
          pending={start.isPending && pendingWeekday === primaryNext.weekday}
          onStart={() => start.mutate(primaryNext.slot)}
        />
      ) : !loading ? (
        <EmptyHub />
      ) : null}

      {/* Upcoming (planned only) */}
      {secondary.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold">אימונים קרובים</h2>
            <Link to="/workouts/program" className="text-xs font-semibold text-primary">
              תכנון שבועי
            </Link>
          </div>
          <div className="space-y-3">
            {secondary.map((item) => (
              <UpcomingRow
                key={item.weekday}
                item={item}
                disabled={!!active}
                pending={start.isPending && pendingWeekday === item.weekday}
                onStart={() => {
                  if (active) {
                    setConflict({ active });
                    return;
                  }
                  if (start.isPending) return;
                  start.mutate(item.slot);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {conflict && (
        <ConflictDialog
          active={conflict.active}
          onClose={() => setConflict(null)}
          onContinueActive={() => {
            const s = conflict.active;
            setConflict(null);
            void openActiveSession(s);
          }}
          onFinishActive={() => abandonActive.mutate(conflict.active.id)}
        />
      )}

      {recovery && (
        <RecoveryDialog
          active={recovery.active}
          mode={recovery.mode}
          completedSetCount={recovery.completedSetCount ?? 0}
          message={recovery.message}
          onClose={() => setRecovery(null)}
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

/* ----------------------------- Cards ----------------------------- */

function EmptyHub() {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-center">
      <Dumbbell className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-base font-bold">אין אימון מתוכנן</p>
      <p className="mt-1 text-sm text-muted-foreground">
        הגדר את שבוע האימונים שלך כדי לראות מה הבא בתור.
      </p>
      <Button asChild className="mt-4 h-12 px-6 text-base font-bold">
        <Link to="/workouts/program">לתכנון השבועי</Link>
      </Button>
    </div>
  );
}

function MetaLine({ item }: { item: Upcoming }) {
  const minutes = estimateMinutes(item.meta);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        יום {WEEKDAY_HE[item.weekday]} · {formatDate(item.date)}
      </span>
      {item.meta?.exercises ? <span>· {item.meta.exercises} תרגילים</span> : null}
      {item.meta?.focus ? <span>· {item.meta.focus}</span> : null}
      {minutes ? (
        <span className="inline-flex items-center gap-1">
          · <Clock className="h-3 w-3" /> ~{minutes}׳
        </span>
      ) : null}
    </p>
  );
}

function WorkoutIdentity({ name, compact = false }: { name: string; compact?: boolean }) {
  const letter = workoutLetter(name);
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary/8 to-sky-500/10 text-primary ${
        compact ? "h-14 w-14" : "h-16 w-16"
      }`}
      aria-hidden
    >
      <div className="absolute -end-4 -top-4 h-10 w-10 rounded-full bg-primary/15 blur-xl" />
      {letter ? (
        <div className="relative flex items-end gap-1">
          <span className={`${compact ? "text-2xl" : "text-3xl"} font-black leading-none`}>{letter}</span>
          <Dumbbell className="mb-0.5 h-3.5 w-3.5 opacity-75" />
        </div>
      ) : (
        <Dumbbell className={compact ? "h-5 w-5" : "h-6 w-6"} />
      )}
    </div>
  );
}

function NextWorkoutCard({
  item,
  pending,
  onStart,
}: {
  item: Upcoming;
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <div className="rounded-3xl border-2 border-primary bg-card p-4 shadow-glow">
      <div className="flex items-center gap-3">
        <WorkoutIdentity name={item.name} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            האימון הבא
          </p>
          <p className="truncate text-[22px] font-extrabold leading-tight">{item.name}</p>
          <MetaLine item={item} />
        </div>
      </div>
      <Button
        className="mt-4 h-14 w-full text-lg font-extrabold"
        onClick={onStart}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="ml-1 h-5 w-5 animate-spin" />
        ) : (
          <Play className="ml-1 h-5 w-5" />
        )}
        התחל אימון
      </Button>
    </div>
  );
}

function UpcomingRow({
  item,
  disabled,
  pending,
  onStart,
}: {
  item: Upcoming;
  disabled: boolean;
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-3xl border border-border bg-card p-3 ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <WorkoutIdentity name={item.name} compact />
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-base font-bold">{item.name}</p>
        <MetaLine item={item} />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 min-w-[76px] font-bold"
        onClick={onStart}
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "התחל"}
      </Button>
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
  const elapsed = Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 1000));
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
            <span className="text-[11px] font-semibold uppercase tracking-wider">אימון פעיל</span>
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
          {pressed ? (
            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="ml-1 h-4 w-4" />
          )}
          המשך אימון
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Dialogs ----------------------------- */

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
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>יש לך אימון פעיל</DialogTitle>
          <DialogDescription>אפשר להתחיל אימון חדש רק אחרי שהאימון הפעיל יסתיים.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-base font-bold">{active.name ?? "אימון"}</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
              {formatTotalTime(elapsed)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button className="h-12 text-base font-bold" onClick={onContinueActive}>
              המשך אימון פעיל
            </Button>
            <Button variant="outline" className="h-12 text-base font-bold" onClick={onFinishActive}>
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
  onContinue,
  onAbandon,
  abandoning,
}: {
  active: SessionRow;
  mode: "stale" | "invalid";
  completedSetCount: number;
  message?: string;
  onClose: () => void;
  onContinue: () => void;
  onAbandon: () => void;
  abandoning: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {mode === "stale" ? "האימון פתוח הרבה זמן" : "לא הצלחנו לשחזר את האימון"}
          </DialogTitle>
          <DialogDescription>
            {message ??
              (mode === "stale"
                ? "האימון הזה נפתח מזמן. אפשר להמשיך אותו או לסיים אותו."
                : "האימון הפעיל אינו תקין. מומלץ לסיים אותו ולהתחיל מחדש.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="truncate text-base font-bold">{active.name ?? "אימון"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{completedSetCount} סטים הושלמו</p>
          </div>
          <div className="flex flex-col gap-2">
            {mode === "stale" && (
              <Button className="h-12 text-base font-bold" onClick={onContinue}>
                המשך בכל זאת
              </Button>
            )}
            <Button
              variant="outline"
              className="h-12 text-base font-bold"
              onClick={onAbandon}
              disabled={abandoning}
            >
              {abandoning ? "מסיים..." : "סיים את האימון התקוע"}
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
