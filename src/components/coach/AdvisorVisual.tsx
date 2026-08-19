import { Activity, Dumbbell, HeartPulse, Salad } from "lucide-react";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { cn } from "@/lib/utils";

const icons = {
  recovery: HeartPulse,
  strength: Dumbbell,
  movement: Activity,
  nutrition: Salad,
};

export function AdvisorVisual({
  advisor,
  variant = "cover",
}: {
  advisor: CoachAdvisor;
  variant?: "cover" | "hero" | "avatar";
}) {
  const Icon = icons[advisor.icon];
  const image = variant === "cover" ? advisor.media.cover : variant === "hero" ? advisor.media.hero : null;
  const objectPosition =
    variant === "cover"
      ? advisor.media.coverPosition
      : variant === "hero"
        ? advisor.media.heroPosition
        : undefined;

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-muted/40",
        variant === "cover" && "aspect-[4/3] w-full rounded-2xl",
        variant === "hero" && "h-36 w-full rounded-3xl sm:h-44",
        variant === "avatar" && "h-11 w-11 shrink-0 rounded-2xl",
      )}
      aria-label={image ? `תמונה של ${advisor.name}` : `מקום שמור לתמונה של ${advisor.name}`}
    >
      <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex items-center gap-2 text-primary">
          <span className={cn("font-black", variant === "avatar" ? "text-xl" : "text-4xl")}>
            {advisor.initials}
          </span>
          <Icon className={variant === "avatar" ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
        </div>
      </div>
      {variant === "hero" && (
        <p className="absolute inset-x-3 bottom-2 text-center text-[11px] text-muted-foreground">
          Chat Hero — תמונת היועץ תתווסף בהמשך
        </p>
      )}
      {image && (
        <img
          key={image}
          src={image}
          alt={advisor.name}
          className="absolute inset-0 z-10 h-full w-full object-cover"
          style={{ objectPosition }}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </div>
  );
}
