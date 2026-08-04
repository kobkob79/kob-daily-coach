/**
 * Performance Snapshot — compact summary cards for the Command Center.
 */
import { cn } from "@/lib/utils";

export interface SnapshotItem {
  id: string;
  emoji: string;
  label: string;
  value: string;
  hint?: string;
  accent: "lime" | "indigo" | "cyan" | "orange" | "rose";
  progress?: number | null;
}

const ACCENT_BG: Record<SnapshotItem["accent"], string> = {
  lime: "bg-primary/12 text-primary",
  indigo: "bg-accent/20 text-accent",
  cyan: "bg-sky-500/15 text-sky-300",
  orange: "bg-orange-500/15 text-orange-300",
  rose: "bg-rose-500/15 text-rose-300",
};

const ACCENT_BAR: Record<SnapshotItem["accent"], string> = {
  lime: "bg-primary",
  indigo: "bg-accent",
  cyan: "bg-sky-400",
  orange: "bg-orange-400",
  rose: "bg-rose-400",
};

export function PerformanceSnapshot({ items }: { items: SnapshotItem[] }) {
  return (
    <section className="animate-stagger">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold tracking-tight">תמונת מצב</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.id} className="glass-tile flex flex-col gap-3 overflow-hidden p-4">
            <div className="flex items-start justify-between">
              <div
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-2xl text-[18px]",
                  ACCENT_BG[it.accent],
                )}
              >
                <span aria-hidden>{it.emoji}</span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {it.label}
              </span>
            </div>
            <div>
              <p className="text-[22px] font-bold leading-none tracking-tight tabular-nums">
                {it.value}
              </p>
              {it.hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{it.hint}</p>}
            </div>
            {typeof it.progress === "number" && (
              <div className="h-1 overflow-hidden rounded-full bg-white/6">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    ACCENT_BAR[it.accent],
                  )}
                  style={{ width: `${Math.max(2, Math.min(100, it.progress))}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
