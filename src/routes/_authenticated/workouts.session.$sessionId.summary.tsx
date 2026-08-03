/**
 * Session summary + feedback + save.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Flame,
  Clock,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeVolume,
  detectPRs,
  finalizeSession,
  getSession,
  getSessionSets,
  type PainLevel,
} from "@/lib/workout-session";
import { supabase } from "@/integrations/supabase/client";
import { clearWorkoutTimer as clearTotalWorkoutTimer } from "@/hooks/useWorkoutTimer";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/summary")({
  component: SummaryPage,
});

function SummaryPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [difficulty, setDifficulty] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [pain, setPain] = useState<PainLevel>("none");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["session_summary", sessionId],
    queryFn: async () => {
      const [session, sets, u] = await Promise.all([
        getSession(sessionId),
        getSessionSets(sessionId),
        supabase.auth.getUser(),
      ]);
      const prs = u.data.user
        ? await detectPRs(u.data.user.id, sessionId, sets)
        : {};
      // Fetch exercise names for PRs
      const exerciseIds = Object.keys(prs).filter((id) => prs[id]);
      let names: Record<string, string> = {};
      if (exerciseIds.length) {
        const { data } = await supabase
          .from("exercises")
          .select("id,name")
          .in("id", exerciseIds);
        for (const row of data ?? []) names[row.id] = row.name;
      }
      const started = session?.started_at ? new Date(session.started_at).getTime() : Date.now();
      const durationMin = Math.max(1, Math.round((Date.now() - started) / 60000));
      return {
        session,
        volume: Math.round(computeVolume(sets)),
        durationMin,
        completedSets: sets.filter((s) => s.completed_at).length,
        prNames: Object.keys(prs).filter((id) => prs[id]).map((id) => names[id] ?? "תרגיל"),
      };
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      finalizeSession(sessionId, { difficulty, energy, pain, notes }),
    onSuccess: () => {
      clearTotalWorkoutTimer(sessionId);
      // Weekly cards + global bar must flip status immediately.
      qc.invalidateQueries({ queryKey: ["active-session"] });
      qc.invalidateQueries({ queryKey: ["sessions", "recent"] });
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      toast.success("האימון נשמר");
      navigate({ to: "/workouts/session/$sessionId/debrief", params: { sessionId } });

    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="p-6 text-center text-sm">…</p>;

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-4">
      {/* Celebration hero — the workout completion moment */}
      <div className="surface-card animate-slide-up relative grid place-items-center gap-2 overflow-hidden p-6 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-hero)] opacity-40" />
        <span className="animate-breathe relative grid h-20 w-20 place-items-center rounded-full bg-success/15">
          <CheckCircle2 className="animate-stagger h-12 w-12 text-success" />
        </span>
        <h1 className="animate-fade-in relative text-2xl font-extrabold">האימון הושלם</h1>
        <p className="relative text-sm text-muted-foreground">{q.data?.session?.name}</p>
        <p className="relative text-xs text-muted-foreground">
          {q.data?.completedSets} סטים הושלמו
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          <Stat key="d" icon={<Clock className="h-4 w-4" />} label="משך" value={`${q.data?.durationMin}׳`} />,
          <Stat key="v" icon={<Flame className="h-4 w-4" />} label="נפח" value={`${q.data?.volume} ק״ג`} />,
          <Stat key="p" icon={<Trophy className="h-4 w-4" />} label="שיאים" value={String(q.data?.prNames.length ?? 0)} />,
        ].map((node, i) => (
          <div key={i} className="animate-stagger" style={{ animationDelay: `${120 + i * 90}ms` }}>
            {node}
          </div>
        ))}
      </div>

      {(q.data?.prNames.length ?? 0) > 0 && (
        <div className="surface-card animate-slide-up space-y-1 border border-primary/50 p-4 shadow-glow">
          <p className="animate-soft-pulse text-xs font-bold uppercase tracking-wider text-primary">
            שיאים אישיים חדשים 🎯
          </p>
          {q.data!.prNames.map((n, i) => (
            <p
              key={i}
              className="animate-stagger text-sm font-bold"
              style={{ animationDelay: `${200 + i * 110}ms` }}
            >
              🏆 {n}
            </p>
          ))}
        </div>
      )}

      {/* Feedback */}
      <div className="surface-card space-y-4 p-4">
        <RatingRow label="קושי" value={difficulty} onChange={setDifficulty} />
        <RatingRow label="אנרגיה" value={energy} onChange={setEnergy} />
        <div>
          <p className="mb-2 text-sm font-medium">כאב</p>
          <div className="grid grid-cols-3 gap-2">
            {(["none", "mild", "significant"] as PainLevel[]).map((p) => (
              <Button
                key={p}
                variant={pain === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPain(p)}
              >
                {p === "none" ? "אין" : p === "mild" ? "קל" : "משמעותי"}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">הערות</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="איך הלך?"
            rows={3}
          />
        </div>
      </div>

      <Button
        size="lg"
        className="h-14 w-full text-lg"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        שמור אימון
      </Button>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface-card grid place-items-center gap-1 p-3 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`h-10 flex-1 rounded-xl border text-sm font-semibold ${
              value >= n
                ? "border-primary bg-primary/20 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
