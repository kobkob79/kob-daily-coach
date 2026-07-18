/**
 * Session detail — view/edit a completed session.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, getSessionSets, updateSet, deleteSet, type SessionSet } from "@/lib/workout-session";
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
      const [session, sets] = await Promise.all([
        getSession(sessionId),
        getSessionSets(sessionId),
      ]);
      const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
      const { data: exs } = exerciseIds.length
        ? await supabase.from("exercises").select("id,name,muscle_group").in("id", exerciseIds)
        : { data: [] as { id: string; name: string; muscle_group: string | null }[] };
      const byId = new Map((exs ?? []).map((e) => [e.id, e]));
      return { session, sets, byId };
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
  const { session, sets, byId } = q.data!;

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
