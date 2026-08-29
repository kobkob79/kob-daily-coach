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

export function AdvisorContextNotice({ flags }: AdvisorContextNoticeProps) {
  // Extract keys of flags that are not missing/stale/conflicting directly,
  // but translate them to natural Hebrew indicating they might need update.
  const hasIssues = flags.length > 0;

  if (!hasIssues) return null;

  return (
    <div
      className="flex gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground"
      dir="rtl"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="font-bold">ההמלצות הן כלליות בלבד ואינן תחליף לייעוץ רפואי או מקצועי.</p>
        <p className="mt-1">
          שימו לב, ייתכן שחסר מידע עדכני לגבי:{" "}
          {flags.map((f) => contextTranslations[f.key] || f.key).join(", ")}.
        </p>
      </div>
    </div>
  );
}
