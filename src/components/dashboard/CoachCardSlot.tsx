/**
 * Coach Card — premium placeholder slot for the future AI coach.
 * UI only, no AI implementation (VIORA-HOME-001).
 */
import { Sparkles } from "lucide-react";

export function CoachCardSlot({ hint }: { hint?: string }) {
  return (
    <section className="animate-stagger">
      <div className="glass-tile relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div className="relative flex items-start gap-3.5">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-5 w-5 text-primary-foreground" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Viora Coach
            </p>
            <p className="mt-0.5 text-[15px] font-bold tracking-tight">המאמן האישי שלך</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {hint ?? "התובנות האישיות של Viora יופיעו כאן."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
