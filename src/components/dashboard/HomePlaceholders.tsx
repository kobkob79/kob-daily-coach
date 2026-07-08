import { Sparkles, Activity } from "lucide-react";
import { PremiumCard } from "@/components/ui-kit/Section";

export function AICoachPlaceholderCard() {
  return (
    <PremiumCard>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            AI Coach
          </p>
          <p className="text-base font-semibold">המאמן האישי של Viora</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            המאמן האישי של Viora יופיע כאן לאחר שנאסוף מספיק מידע על היום.
          </p>
        </div>
      </div>
    </PremiumCard>
  );
}

export function BodyScorePlaceholderCard() {
  return (
    <PremiumCard>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Body Score
            </p>
            <p className="text-base font-semibold">ציון הגוף שלך</p>
            <p className="text-xs text-muted-foreground mt-0.5">יחושב בקרוב</p>
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-muted-foreground/60">
          --
        </div>
      </div>
    </PremiumCard>
  );
}
