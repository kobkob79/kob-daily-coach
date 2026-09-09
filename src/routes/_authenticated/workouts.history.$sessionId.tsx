/**
 * Session detail — view/edit a completed session.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, ChevronRight, Clock, Dumbbell, Flame, Sparkles, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeVolume,
  detectPRs,
  getSession,
  getSessionSets,
  updateSet,
  deleteSet,
  type SessionRow,
  type SessionSet,
} from "@/lib/workout-session";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workouts/history/$sessionId")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["session_detail", sessionId],
    queryFn: async () => {
      const [session, sets, u] = await Promise.all([
        getSession(sessionId),
        getSessionSets(sessionId),
        supabase.auth.getUser(),
      ]);
      const prs = u.data.user ? await detectPRs(u.data.user.id, sessionId, sets) : {};
      const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
      const { data: exs } = exerciseIds.length
        ? await supabase.from("exercises").select("id,name,muscle_group").in("id", exerciseIds)
        : { data: [] as { id: string; name: string; muscle_group: string | null }[] };
      const byId = new Map((exs ?? []).map((e) => [e.id, e]));
      return { session, sets, byId, prs };
    },
  });

  const upd = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SessionSet> }) => updateSet(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_detail", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session_detail", sessionId] }),
  });

  if (q.isLoading) return <p className="p-6 text-center text-sm">…</p>;
  if (q.isError || !q.data) {
    return (
      <div dir="rtl" className="space-y-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link to="/workouts/history">
              <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
            </Link>
          </Button>
          <h1 className="text-lg font-bold">אימון</h1>
          <div className="w-16" />
        </div>
        <p className="p-6 text-center text-sm text-muted-foreground">
          לא הצלחנו לטעון את האימון הזה.
        </p>
      </div>
    );
  }
  const { session, sets, byId, prs } = q.data;

  // group by exercise, keep order
  const groups: { exerciseId: string; sets: SessionSet[] }[] = [];
  for (const s of sets) {
    let g = groups.find((x) => x.exerciseId === s.exercise_id);
    if (!g) {
      g = { exerciseId: s.exercise_id, sets: [] };
      groups.push(g);
    }
    g.sets.push(s);
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts/history">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">{session?.name ?? "אימון"}</h1>
        <div className="w-16" />
      </div>

      <Button
        asChild
        size="lg"
        variant="outline"
        className="h-11 w-full gap-2 text-base"
        aria-label="פתח את תחקיר המאמן עבור האימון הזה"
      >
        <Link
          to="/workouts/session/$sessionId/debrief"
          params={{ sessionId }}
        >
          <Sparkles className="h-5 w-5 text-primary" />
          תחקיר המאמן
        </Link>
      </Button>

      <SessionSummaryCard session={session} sets={sets} prs={prs} />

      {groups.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          לא נמצא פירוט סטים עבור האימון הזה — כנראה אימון ישן שנשמר בפורמט קודם.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.exerciseId} className="surface-card space-y-2 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {byId.get(g.exerciseId)?.muscle_group ?? ""}
          </p>
          <p className="text-base font-semibold">{byId.get(g.exerciseId)?.name ?? "תרגיל"}</p>
          {g.sets.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-6 text-center text-xs text-muted-foreground">{s.set_number}</span>
              <Input
                inputMode="decimal"
                className="h-10 text-center"
                value={s.weight_kg ?? ""}
                onChange={(e) =>
                  upd.mutate({
                    id: s.id,
                    patch: { weight_kg: e.target.value === "" ? null : Number(e.target.value) },
                  })
                }
              />
              <span className="text-muted-foreground">×</span>
              <Input
                inputMode="numeric"
                className="h-10 text-center"
                value={s.reps ?? ""}
                onChange={(e) =>
                  upd.mutate({
                    id: s.id,
                    patch: { reps: e.target.value === "" ? null : Number(e.target.value) },
                  })
                }
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del.mutate(s.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  completed: "אימון הושלם",
  in_progress: "בתהליך",
  discarded: "בוטל",
  abandoned: "נטוש",
  cancelled: "בוטל",
};

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-success/15", text: "text-success" },
  in_progress: { bg: "bg-primary/15", text: "text-primary" },
  discarded: { bg: "bg-muted/40", text: "text-muted-foreground" },
  abandoned: { bg: "bg-destructive/15", text: "text-destructive" },
  cancelled: { bg: "bg-muted/40", text: "text-muted-foreground" },
};

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} ש׳`;
  if (m > 0) return `${m}׳`;
  return `${s} שנ׳`;
}

function formatSessionDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SessionSummaryCard({
  session,
  sets,
  prs,
}: {
  session: SessionRow | null;
  sets: SessionSet[];
  prs: Record<string, boolean>;
}) {
  const completedSets = sets.filter((s) => s.completed_at).length;
  const totalSets = sets.length;

  const durationSeconds =
    session?.duration_seconds ??
    (session?.started_at && session?.finished_at
      ? Math.max(
          0,
          Math.round(
            (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000,
          ),
        )
      : null);

  const volume = session?.total_volume_kg ?? computeVolume(sets);
  const prCount = Object.values(prs).filter(Boolean).length;
  const status = session?.status ?? "";
  const statusLabel = STATUS_LABEL[status] ?? session?.status ?? "—";
  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.discarded;
  const dateTime = formatSessionDateTime(session?.finished_at ?? session?.started_at);

  const tiles: { icon: React.ReactNode; label: string; value: React.ReactNode; visible: boolean }[] = [
    {
      icon: <Clock className="h-4 w-4" />,
      label: "משך",
      value: (
        <bdi dir="ltr">{formatDuration(durationSeconds)}</bdi>
      ),
      visible: durationSeconds != null && durationSeconds > 0,
    },
    {
      icon: <Dumbbell className="h-4 w-4" />,
      label: "סטים",
      value: (
        <bdi dir="ltr">
          {completedSets} / {totalSets}
        </bdi>
      ),
      visible: totalSets > 0,
    },
    {
      icon: <Flame className="h-4 w-4" />,
      label: "נפח",
      value: (
        <bdi dir="ltr">{Math.round(volume).toLocaleString("he-IL")} ק״ג</bdi>
      ),
      visible: volume > 0,
    },
    {
      icon: <Trophy className="h-4 w-4" />,
      label: "שיאים",
      value: (
        <bdi dir="ltr">{prCount}</bdi>
      ),
      visible: completedSets > 0,
    },
  ];

  const visibleTiles = tiles.filter((t) => t.visible);

  return (
    <div className="surface-card hero-glow relative overflow-hidden p-4 shadow-soft">
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {statusLabel}
          </span>
          <span className="text-xs text-muted-foreground">{dateTime}</span>
        </div>
        {visibleTiles.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {visibleTiles.map((tile, i) => (
              <div
                key={i}
                className="flex min-h-[44px] flex-col justify-center gap-1 rounded-xl bg-background/60 p-2.5"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-primary">{tile.icon}</span>
                  <span>{tile.label}</span>
                </div>
                <p className="text-sm font-bold tabular-nums">{tile.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
