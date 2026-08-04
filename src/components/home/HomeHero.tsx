/**
 * Home Hero (VIORA-HOME-IMPLEMENTATION-001)
 *
 * Exactly ONE hero is rendered on Home. The hero kind is derived from the
 * already-computed Today's Focus, so no extra queries and no AI are needed.
 * Supported placeholder states: workout · recovery · hydration · check-in.
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodaysFocus } from "@/lib/command-center";

export type HomeHeroKind = "workout" | "recovery" | "hydration" | "checkin" | "neutral";

const KIND_BY_FOCUS: Record<string, HomeHeroKind> = {
  workout: "workout",
  recovery: "recovery",
  water: "hydration",
  checkin: "checkin",
  meal: "neutral",
  rest: "neutral",
};

const KIND_LABEL: Record<HomeHeroKind, string> = {
  workout: "אימון",
  recovery: "התאוששות",
  hydration: "שתייה",
  checkin: "צ׳ק-אין",
  neutral: "היום שלך",
};

const KIND_TINT: Record<HomeHeroKind, string> = {
  workout: "bg-primary/15 text-primary",
  recovery: "bg-accent/20 text-accent",
  hydration: "bg-sky-500/15 text-sky-300",
  checkin: "bg-orange-500/15 text-orange-300",
  neutral: "bg-white/10 text-foreground",
};

export function heroKindFromFocus(focus: TodaysFocus): HomeHeroKind {
  return KIND_BY_FOCUS[focus.id] ?? "neutral";
}

export function HomeHero({ focus }: { focus: TodaysFocus }) {
  const kind = heroKindFromFocus(focus);

  return (
    <section className="animate-stagger">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold tracking-tight">הפוקוס של היום</h2>
        <span className="text-[11px] font-medium text-muted-foreground">{KIND_LABEL[kind]}</span>
      </div>

      <Link to={focus.to as never} className="block">
        <div className="glass-tile relative overflow-hidden p-6 transition-all duration-300 active:scale-[0.99]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          />
          <div className="relative">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[22px]",
                  KIND_TINT[kind],
                )}
              >
                <span aria-hidden>{focus.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-bold leading-tight tracking-tight">{focus.title}</p>
                <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                  {focus.subtitle}
                </p>
              </div>
            </div>

            {focus.progress != null && (
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/6">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(2, focus.progress)}%` }}
                />
              </div>
            )}

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-primary/12 px-4 py-3.5">
              <span className="text-[14px] font-bold text-primary">{focus.ctaLabel}</span>
              <ChevronLeft className="h-4 w-4 text-primary rtl:rotate-180" />
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}
