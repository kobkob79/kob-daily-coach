/**
 * Chronological Today timeline — merges meals, water, workouts,
 * supplements, weight, sleep and health logs into one feed.
 */
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { History } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatItemTime, type TimelineItem } from "@/lib/timeline";
import { cn } from "@/lib/utils";

const KIND_TINT: Record<TimelineItem["kind"], string> = {
  meal: "bg-primary/10 text-primary",
  water: "bg-accent/15 text-accent",
  workout: "bg-primary/10 text-primary",
  supplement: "bg-muted text-foreground",
  weight: "bg-muted text-foreground",
  sleep: "bg-accent/15 text-accent",
  health: "bg-destructive/10 text-destructive",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <section>
      <SectionHeader title={t("timeline.title")} subtitle={t("timeline.subtitle")} />
      {items.length === 0 ? (
        <PremiumCard>
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title={t("timeline.empty")}
            hint={t("timeline.emptyHint")}
          />
        </PremiumCard>
      ) : (
        <PremiumCard className="p-0">
          <ul className="divide-y divide-border/60">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg",
                    KIND_TINT[it.kind],
                  )}
                >
                  {it.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{it.title}</p>
                  {it.subtitle && (
                    <p className="truncate text-[11px] text-muted-foreground">{it.subtitle}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {formatItemTime(it.time)}
                </span>
              </li>
            ))}
          </ul>
        </PremiumCard>
      )}
    </section>
  );
}
