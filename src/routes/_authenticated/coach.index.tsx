import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AdvisorCard } from "@/components/coach/AdvisorCard";
import { COACH_ADVISORS } from "@/lib/coach-advisors";

export const Route = createFileRoute("/_authenticated/coach/")({
  component: CoachHubPage,
});

function CoachHubPage() {
  return (
    <div dir="rtl" className="space-y-5 pb-4">
      <header>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">Viora Coach</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">היועצים שלך</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          בחרו את היועץ שמתאים למה שצריך עכשיו.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3" aria-label="יועצי Viora">
        {COACH_ADVISORS.map((advisor) => (
          <AdvisorCard key={advisor.id} advisor={advisor} />
        ))}
      </section>
    </div>
  );
}
