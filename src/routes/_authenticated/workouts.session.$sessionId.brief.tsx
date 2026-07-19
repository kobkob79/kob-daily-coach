/**
 * Pre-workout AI briefing screen.
 * Short rule-based 3-line insight before the session begins.
 * On "Start", seeds planned sets from the template (using last-performance
 * per exercise when available), then navigates to the overview.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  buildBriefing,
  getSession,
  seedSessionFromTemplate,
} from "@/lib/workout-session";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/brief")({
  component: BriefPage,
});

function BriefPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["session_brief", sessionId],
    queryFn: async () => {
      const session = await getSession(sessionId);
      if (!session?.template_id) {
        return {
          session,
          brief: {
            todayLine: `היום: ${session?.name ?? "אימון"}`,
            previousLine: "אין נתוני עבר.",
            tipLine: "התחל בחימום קצר.",
          },
        };
      }
      const brief = await buildBriefing(session.name ?? "אימון", session.template_id);
      return { session, brief };
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      if (q.data?.session?.template_id) {
        await seedSessionFromTemplate(sessionId, q.data.session.template_id);
      }
    },
    onSuccess: () => {
      navigate({ to: "/workouts/session/$sessionId", params: { sessionId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/workouts">
          <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
        </Link>
      </Button>

      <div className="surface-card space-y-4 p-6">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Viora Brief</span>
        </div>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">מכינה תדרוך…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xl font-bold leading-snug">{q.data?.brief.todayLine}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {q.data?.brief.previousLine}
            </p>
            <p className="rounded-2xl bg-primary/10 p-3 text-sm leading-relaxed">
              💡 {q.data?.brief.tipLine}
            </p>
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="h-14 w-full text-lg"
        onClick={() => start.mutate()}
        disabled={start.isPending}
      >
        <Play className="mr-2 h-5 w-5" /> בואו נתחיל
      </Button>
    </div>
  );
}
