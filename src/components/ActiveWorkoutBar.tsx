/**
 * ActiveWorkoutBar — persistent "אימון פעיל" strip.
 *
 * Sits above the bottom navigation on every main screen while an
 * in-progress workout_sessions row exists for the signed-in user.
 * Source of truth = the DB row; timer is derived locally from
 * `started_at`. No writes here.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveSession } from "@/lib/workout-session";
import { formatTotalTime } from "@/hooks/useWorkoutTimer";

export function ActiveWorkoutBar() {
  const activeQ = useQuery({
    queryKey: ["active-session"],
    queryFn: getActiveSession,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const session = activeQ.data ?? null;
  const sessionId = session?.id ?? null;

  // Current exercise = first exercise (by set position) with an incomplete set.
  const currentQ = useQuery({
    enabled: !!sessionId,
    queryKey: ["active-session-current", sessionId],
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data: sets } = await (supabase as any)
        .from("workout_sets")
        .select("exercise_id, position, set_number, completed_at")
        .eq("session_id", sessionId)
        .order("position", { ascending: true })
        .order("set_number", { ascending: true });
      const rows = (sets ?? []) as Array<{
        exercise_id: string;
        position: number | null;
        set_number: number;
        completed_at: string | null;
      }>;
      const open = rows.find((r) => !r.completed_at) ?? rows[0];
      if (!open) return null;
      const { data: ex } = await supabase
        .from("exercises")
        .select("name")
        .eq("id", open.exercise_id)
        .maybeSingle();
      return { name: (ex?.name as string | undefined) ?? null };
    },
  });

  const startedAt = session?.started_at ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = useMemo(() => {
    if (!startedAt) return 0;
    const t = new Date(startedAt).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((now - t) / 1000));
  }, [startedAt, now]);

  if (!session || !sessionId) return null;

  const exerciseName = currentQ.data?.name ?? session.name ?? "אימון";

  return (
    <Link
      to="/workouts/session/$sessionId"
      params={{ sessionId }}
      dir="rtl"
      aria-label="חזרה לאימון הפעיל"
      className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-card/90 px-4 py-2.5 shadow-glow backdrop-blur-2xl transition active:scale-[0.99]"
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15">
        <Dumbbell className="h-4 w-4 text-primary" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 grid h-3 w-3 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-primary shadow-glow" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          אימון פעיל
        </p>
        <p className="truncate text-sm font-bold text-foreground">
          {exerciseName}
        </p>
      </div>
      <div className="shrink-0 text-left">
        <p className="font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTotalTime(elapsed)}
        </p>
        <p className="text-[10px] text-muted-foreground">חזרה לאימון</p>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-primary" />
    </Link>
  );
}
