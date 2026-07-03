/**
 * Smart Daily Coach — replaces the static greeting on the Home screen.
 * Given aggregated inputs, renders 1–4 ordered hint chips.
 */
import { Sparkles, AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { CoachHint } from "@/lib/timeline";
import { PremiumCard } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const ICONS = {
  good: CheckCircle2,
  warn: AlertCircle,
  info: Info,
} as const;

const TONE_CLASSES: Record<CoachHint["tone"], string> = {
  good: "text-success",
  warn: "text-warning",
  info: "text-primary",
};

export function SmartCoach({ hints, name }: { hints: CoachHint[]; name: string }) {
  return (
    <PremiumCard className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "var(--gradient-hero)" }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <div
            className="grid h-10 w-10 place-items-center rounded-2xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("coach.title")}
            </p>
            <p className="truncate text-base font-semibold">
              {t("coach.hello")}, <span className="gradient-text">{name}</span>
            </p>
          </div>
        </div>

        {hints.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {hints.map((h) => {
              const Icon = ICONS[h.tone];
              return (
                <li
                  key={h.id}
                  className="flex items-start gap-2.5 rounded-2xl border border-border/50 bg-background/40 p-3"
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_CLASSES[h.tone])} />
                  <p className="text-sm leading-relaxed">{h.text}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("coach.empty")}</p>
        )}
      </div>
    </PremiumCard>
  );
}
