import { ShieldAlert } from "lucide-react";
import { type AdvisorContextFlag } from "@/lib/advisor-conversations";

interface AdvisorContextNoticeProps {
  flags: readonly AdvisorContextFlag[];
}

const contextTranslations: Record<string, string> = {
  profile: "פרופיל",
  goals: "מטרות",
  bioDay: "מדדים יומיים",
  shift: "משמרת",
  nutrition: "תזונה",
  hydration: "שתייה",
  workouts: "אימונים",
  sleep: "שינה",
  recovery: "התאוששות",
  limitations: "מגבלות",
};

const stateTranslations = {
  missing: "חסר",
  stale: "דורש עדכון",
  conflicting: "לא תואם למידע אחר",
} as const;

export function AdvisorContextNotice({ flags }: AdvisorContextNoticeProps) {
  if (!flags.length) return null;

  return (
    <div
      className="flex gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground"
      dir="rtl"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="font-bold">כדאי לשים לב למידע שעליו מבוססת התשובה</p>
        <p className="mt-1">
          {flags
            .map(
              (flag) =>
                `${contextTranslations[flag.key] ?? "מידע נוסף"}: ${stateTranslations[flag.state]}`,
            )
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}
