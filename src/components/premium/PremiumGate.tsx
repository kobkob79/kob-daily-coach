/**
 * PremiumGate — a calm, tasteful gate shown where a Viora AI capability
 * lives. It never blocks the deterministic core experience; it only
 * explains what Premium adds and offers a single next step.
 *
 * UI only: no billing, no provider calls.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Plug, Sparkles } from "lucide-react";
import { PremiumCard } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlanBadge({ premium, className }: { premium: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
        premium
          ? "bg-primary/15 text-primary"
          : "border border-border/60 bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {premium ? "Premium" : "Free"}
    </span>
  );
}

interface PremiumGateProps {
  /** "locked" = free plan, "connect" = premium but no AI provider linked. */
  variant: "locked" | "connect";
  title?: string;
  description?: string;
  /** Small list of what the AI layer adds — keep to 3 short lines. */
  points?: readonly string[];
  children?: ReactNode;
  className?: string;
}

const DEFAULT_POINTS = [
  "שיחה חיה עם היועצים של Viora",
  "ניתוח אישי של אימונים ותזונה",
  "תשובות שמתאימות ליום שלך",
] as const;

export function PremiumGate({
  variant,
  title,
  description,
  points = DEFAULT_POINTS,
  children,
  className,
}: PremiumGateProps) {
  const locked = variant === "locked";

  return (
    <PremiumCard
      className={cn("relative overflow-hidden border-primary/25 bg-card/80 text-right", className)}
    >
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />

      <div className="relative flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          {locked ? (
            <Lock className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          ) : (
            <Plug className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-extrabold leading-tight tracking-tight">
              {title ?? (locked ? "Viora AI זמין ב־Premium" : "חברו AI כדי להתחיל")}
            </h3>
            {locked && <PlanBadge premium />}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {description ??
              (locked
                ? "כל שאר Viora פתוח וזמין לך במלואו. Premium מוסיף שכבת AI אישית מעל הנתונים שלך."
                : "התחברו לחשבון ה־AI שלכם כדי לשוחח עם היועצים של Viora.")}
          </p>
        </div>
      </div>

      {locked && points.length > 0 && (
        <ul className="relative mt-3.5 space-y-2 border-t border-border/50 pt-3.5">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2 text-[12px] text-foreground/85">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-4 flex flex-col gap-2">
        {children ?? (
          <Button asChild className="min-h-12 w-full rounded-2xl text-[14px] font-bold">
            <Link to="/profile" hash="ai-connection">
              {locked ? "לשדרוג ל־Premium" : "לחיבור AI"}
            </Link>
          </Button>
        )}
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          הנתונים והמסכים הרגילים שלך ממשיכים לעבוד בלי AI.
        </p>
      </div>

    </PremiumCard>
  );
}
