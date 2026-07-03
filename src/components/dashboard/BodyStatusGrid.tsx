/**
 * Colorful Body Status grid — 6 themed cards summarizing today's body.
 */
import { cn } from "@/lib/utils";
import type { BodyStatusCard } from "@/lib/daily-brief";
import { SectionHeader } from "@/components/ui-kit/Section";

export function BodyStatusGrid({ cards }: { cards: BodyStatusCard[] }) {
  return (
    <section>
      <SectionHeader title="מצב הגוף היום" subtitle="עדכון אוטומטי אחרי כל פעולה" />
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <article
            key={c.id}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-border/50 p-3.5 ring-1",
              c.ring,
              "bg-gradient-to-br",
              c.color,
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xl" aria-hidden>{c.emoji}</span>
              <span className="text-[11px] font-semibold tabular-nums text-foreground/80">{c.label}</span>
            </div>
            <p className="mt-2 text-[12px] font-semibold leading-tight">{c.title}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/40">
              <div
                className="h-full rounded-full bg-foreground/60 transition-all duration-500"
                style={{ width: `${Math.max(3, Math.min(100, c.value))}%` }}
              />
            </div>
            <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-foreground/70">{c.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
