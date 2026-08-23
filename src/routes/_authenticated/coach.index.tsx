import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AdvisorCard } from "@/components/coach/AdvisorCard";
import { COACH_ADVISORS } from "@/lib/coach-advisors";
import { PremiumGate } from "@/components/premium/PremiumGate";
import { useVioraPlanUI } from "@/lib/plan-ui";

export const Route = createFileRoute("/_authenticated/coach/")({
  component: CoachHubPage,
});

function CoachHubPage() {
  const { hydrated, isPremium, isConnected } = useVioraPlanUI();
  const showGate = hydrated && !(isPremium && isConnected);

  return (
    <div dir="rtl" className="space-y-4 pb-4">
      <header>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">Viora Coach</span>
        </div>
        <h1 className="mt-1.5 text-[22px] font-extrabold leading-tight">היועצים שלך</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          בחרו את היועץ שמתאים למה שצריך עכשיו.
        </p>
      </header>

      {showGate && (
        <PremiumGate
          variant={isPremium ? "connect" : "locked"}
          description={
            isPremium
              ? "חברו AI כדי להתחיל לשוחח עם היועצים של Viora."
              : "אפשר להכיר את היועצים גם עכשיו. שיחה איתם נפתחת ב־Premium, עם חשבון ה־AI שלך."
          }
        />
      )}

      <section aria-label="יועצי Viora">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          ארבעת היועצים
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {COACH_ADVISORS.map((advisor) => (
            <AdvisorCard key={advisor.id} advisor={advisor} />
          ))}
        </div>
      </section>

    </div>
  );
}
