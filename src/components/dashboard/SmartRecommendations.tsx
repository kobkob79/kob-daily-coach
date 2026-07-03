/**
 * Smart Recommendations card — surfaces the Intelligence Engine output.
 * Each recommendation is expandable to reveal the reasons ("למה?"),
 * satisfying the explainability requirement.
 */
import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { IntelTone, Recommendation } from "@/lib/intelligence";

const TONE_RING: Record<IntelTone, string> = {
  good: "ring-success/30 bg-success/5",
  warn: "ring-warning/30 bg-warning/5",
  info: "ring-primary/20 bg-primary/5",
};
const TONE_DOT: Record<IntelTone, string> = {
  good: "text-success",
  warn: "text-warning",
  info: "text-primary",
};

function RecommendationRow({ r }: { r: Recommendation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-2xl ring-1 p-4", TONE_RING[r.tone])}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-background/60 text-lg">
          <span aria-hidden>{r.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", TONE_DOT[r.tone])}>{r.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{r.action}</p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            {t("intel.why")}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
          {open && r.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-xl bg-background/50 p-3 text-[12px] leading-relaxed text-muted-foreground">
              {r.reasons.map((why, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" />
                  <span>{why}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function SmartRecommendations({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <section>
      <SectionHeader title={t("intel.section.title")} subtitle={t("intel.section.subtitle")} />
      {recommendations.length === 0 ? (
        <PremiumCard>
          <EmptyState icon={<Sparkles className="h-5 w-5" />} title={t("intel.empty")} />
        </PremiumCard>
      ) : (
        <div className="space-y-2.5">
          {recommendations.map((r) => (
            <RecommendationRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}
