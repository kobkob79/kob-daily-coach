/**
 * Workout export preview — shows the full copy/paste text on screen before
 * sending it anywhere, with explicit Copy and Share actions. Reuses the
 * "coach-debrief" query cache from the debrief screen (same query key,
 * staleTime: Infinity there) so this never re-runs the AI debrief.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Copy, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { buildDebriefContext } from "@/lib/coach-debrief";
import { generateCoachDebrief } from "@/lib/coach-debrief.functions";
import { fetchLifeProfile } from "@/lib/life-profile";
import { buildWorkoutExportText } from "@/lib/workout-export";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId/debrief/export")({
  component: ExportPreviewPage,
});

function ExportPreviewPage() {
  const { sessionId } = Route.useParams();
  const run = useServerFn(generateCoachDebrief);
  const [copying, setCopying] = useState(false);

  // Same queryKey as the debrief screen — a cache hit here, no refetch.
  const debriefQ = useQuery({
    queryKey: ["coach-debrief", sessionId],
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const profile = await fetchLifeProfile().catch(() => null);
      const ctx = await buildDebriefContext(sessionId, profile?.first_name ?? "");
      return run({ data: ctx });
    },
  });

  const textQ = useQuery({
    queryKey: ["workout-export-text", sessionId, debriefQ.data ?? null],
    enabled: !debriefQ.isLoading,
    queryFn: () => buildWorkoutExportText(sessionId, debriefQ.data ?? null),
  });

  const text = textQ.data ?? "";
  const loading = debriefQ.isLoading || textQ.isLoading;

  const handleCopy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("האימון הועתק ללוח");
    } catch {
      toast.error("ההעתקה נכשלה");
    } finally {
      setCopying(false);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({ text });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast.error("השיתוף נכשל");
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 py-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts/session/$sessionId/debrief" params={{ sessionId }}>
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">ייצוא אימון</h1>
        <div className="w-16" />
      </div>

      <div className="surface-card p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            מכין את הטקסט…
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-12 flex-1 text-base"
          onClick={handleCopy}
          disabled={loading || copying}
        >
          <Copy className="ml-2 h-4 w-4" />
          העתק
        </Button>
        <Button className="h-12 flex-1 text-base" onClick={handleShare} disabled={loading}>
          <Share2 className="ml-2 h-4 w-4" />
          שתף
        </Button>
      </div>
    </div>
  );
}
