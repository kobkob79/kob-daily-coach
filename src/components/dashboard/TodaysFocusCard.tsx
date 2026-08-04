/**
 * Today's Focus — the single primary action of the day (VIORA-HOME-001).
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { TodaysFocus } from "@/lib/command-center";

export function TodaysFocusCard({ focus }: { focus: TodaysFocus }) {
  return (
    <section className="animate-stagger">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold tracking-tight">הפוקוס של היום</h2>
        <span className="text-[11px] font-medium text-muted-foreground">פעולה אחת</span>
      </div>

      <Link to={focus.to as never} className="block">
        <div className="glass-tile relative overflow-hidden p-5 transition-all duration-300 active:scale-[0.99]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          />
          <div className="relative">
            <div className="flex items-start gap-3.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-[22px]">
                <span aria-hidden>{focus.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight tracking-tight">{focus.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  {focus.subtitle}
                </p>
              </div>
            </div>

            {focus.progress != null && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/6">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(2, focus.progress)}%` }}
                />
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-primary/12 px-4 py-3">
              <span className="text-[14px] font-bold text-primary">{focus.ctaLabel}</span>
              <ChevronLeft className="h-4 w-4 text-primary rtl:rotate-180" />
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}
