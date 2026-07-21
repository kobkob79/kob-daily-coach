/**
 * Session summary + feedback + save.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  clearWorkoutTimer,
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
      toast.success("האימון נשמר");
      navigate({ to: "/workouts/history" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="p-6 text-center text-sm">…</p>;

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-4">
      <div className="surface-card grid place-items-center gap-2 p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h1 className="text-2xl font-extrabold">כל הכבוד!</h1>
        <p className="text-sm text-muted-foreground">{q.data?.session?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Clock className="h-4 w-4" />} label="משך" value={`${q.data?.durationMin}׳`} />
        <Stat icon={<Flame className="h-4 w-4" />} label="נפח" value={`${q.data?.volume} ק״ג`} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="שיאים" value={String(q.data?.prNames.length ?? 0)} />
      </div>

      {(q.data?.prNames.length ?? 0) > 0 && (
        <div className="surface-card space-y-1 p-4">
          <p className="text-xs uppercase tracking-wider text-primary">שיאים חדשים 🎯</p>
          {q.data!.prNames.map((n, i) => (
            <p key={i} className="text-sm font-medium">
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
