/**
 * Viora Daily Analysis — renders the AI-generated multi-section report.
 */
import { Brain, CheckCircle2, ArrowUpCircle, Target, Lightbulb, Pill } from "lucide-react";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import type { DailyBrief } from "@/lib/daily-brief";

function ListBlock({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: "good" | "warn" | "info" | "accent";
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "good"
      ? "text-emerald-500"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "accent"
          ? "text-fuchsia-500"
          : "text-sky-500";
  return (
    <PremiumCard>
      <div className="mb-2 flex items-center gap-2">
        <span className={toneClass}>{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-xl bg-background/40 p-2.5 text-[13px] leading-relaxed"
          >
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current ${toneClass}`} />
            <span className="text-foreground/90">{it}</span>
          </li>
        ))}
      </ul>
    </PremiumCard>
  );
}

export function DailyAnalysisCard({ brief }: { brief: DailyBrief }) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="הניתוח היומי של Viora"
        subtitle="תזונה · אימון · שינה · תוספים — הכל ביחד"
      />

      <PremiumCard className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
            <Brain className="h-4.5 w-4.5 text-white" />
          </div>
          <p className="text-sm font-semibold">ניתוח AI מקיף להיום</p>
        </div>
        <div className="space-y-2.5">
          {brief.analysis.map((a, i) => (
            <div key={i} className="rounded-2xl border border-border/50 bg-background/50 p-3">
              <p className="text-sm font-semibold">
                <span className="me-2" aria-hidden>{a.emoji}</span>
                {a.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{a.body}</p>
            </div>
          ))}
          {brief.calorieVerdict && (
            <div className="rounded-2xl bg-gradient-to-r from-rose-500/10 to-amber-500/10 p-3 text-[13px] font-medium leading-relaxed text-foreground/90 ring-1 ring-rose-400/25">
              🔥 {brief.calorieVerdict}
            </div>
          )}
        </div>
      </PremiumCard>

      {brief.supplementAnalysis.length > 0 && (
        <PremiumCard>
          <div className="mb-2 flex items-center gap-2 text-emerald-500">
            <Pill className="h-4 w-4" />
            <h3 className="text-sm font-semibold">התוספים שלך היום</h3>
          </div>
          <ul className="space-y-2">
            {brief.supplementAnalysis.map((s, i) => (
              <li
                key={i}
                className="rounded-xl bg-emerald-500/5 p-2.5 text-[13px] leading-relaxed ring-1 ring-emerald-500/20"
              >
                <p className="font-semibold text-emerald-500">{s.name}</p>
                <p className="mt-0.5 text-foreground/85">{s.benefit}</p>
              </li>
            ))}
          </ul>
        </PremiumCard>
      )}

      <ListBlock icon={<CheckCircle2 className="h-4 w-4" />} title="מה עשית מצוין היום" items={brief.wellDone} tone="good" />
      <ListBlock icon={<ArrowUpCircle className="h-4 w-4" />} title="מה אפשר לשפר" items={brief.improve} tone="warn" />
      <ListBlock icon={<Target className="h-4 w-4" />} title="המשימה למחר" items={brief.mission} tone="info" />
      <ListBlock icon={<Lightbulb className="h-4 w-4" />} title="מה למדתי עליך היום" items={brief.learned} tone="accent" />
    </section>
  );
}
