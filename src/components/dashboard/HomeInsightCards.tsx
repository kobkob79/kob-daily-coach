/**
 * HomeInsightCards — the Sprint 4 "AI Home Experience" surface.
 * Three focused cards (Daily Brief, Priorities, Progress Overview) that
 * consume a single HomeInsight object. No calculations happen here.
 */
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { Sparkles } from "lucide-react";
import type { HomeInsight } from "@/lib/home-insight";
import { cn } from "@/lib/utils";

export function HomeInsightCards({ insight }: { insight: HomeInsight }) {
  if (!insight.hasEnoughData) {
    return (
      <PremiumCard className="border-dashed">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary/70 to-accent/70 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Viora לומדת אותך
            </p>
            <p className="mt-0.5 text-base font-semibold">{insight.greeting}</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              אני עדיין לא מכירה מספיק את השגרה שלך. ככל שתשתמש ב־Viora, כך אלמד להציע לך יותר.
            </p>
          </div>
        </div>
      </PremiumCard>
    );
  }

  return (
    <div className="space-y-4">
      <DailyBriefCard insight={insight} />
      {insight.priorities.length > 0 && <PrioritiesCard insight={insight} />}
      {insight.progress.length > 0 && <ProgressOverviewCard insight={insight} />}
    </div>
  );
}

function DailyBriefCard({ insight }: { insight: HomeInsight }) {
  return (
    <PremiumCard className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(139,92,246,0.10) 55%, rgba(236,72,153,0.10))",
        }}
        aria-hidden
      />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {insight.greeting}
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight">התקציר של היום</h2>
        <p className="mt-1 text-sm text-foreground/80 leading-relaxed">{insight.headline}</p>
        {insight.briefLines.length > 0 && (
          <ul className="mt-3 space-y-1 text-[13.5px] leading-relaxed text-foreground/90">
            {insight.briefLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </PremiumCard>
  );
}

function PrioritiesCard({ insight }: { insight: HomeInsight }) {
  return (
    <section>
      <SectionHeader title="שלוש עדיפויות להיום" subtitle="הצעדים הכי חשובים כרגע" />
      <div className="space-y-2">
        {insight.priorities.map((p, i) => (
          <PremiumCard key={p.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/60 text-lg">
                <span aria-hidden>{p.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  <span className="me-2 text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                  {p.title}
                </p>
                {p.hint && (
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{p.hint}</p>
                )}
              </div>
            </div>
          </PremiumCard>
        ))}
      </div>
    </section>
  );
}

function ProgressOverviewCard({ insight }: { insight: HomeInsight }) {
  return (
    <section>
      <SectionHeader title="ההתקדמות של היום" subtitle="מבט אחד על כל המדדים" />
      <PremiumCard>
        <ul className="space-y-3">
          {insight.progress.map((row) => (
            <li key={row.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">{row.display}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    row.key === "water" && "bg-gradient-to-r from-sky-400 to-blue-500",
                    row.key === "protein" && "bg-gradient-to-r from-rose-400 to-fuchsia-500",
                    row.key === "workout" && "bg-gradient-to-r from-emerald-400 to-teal-500",
                    row.key === "steps" && "bg-gradient-to-r from-amber-400 to-orange-500",
                  )}
                  style={{ width: `${Math.max(2, row.pct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </PremiumCard>
    </section>
  );
}
