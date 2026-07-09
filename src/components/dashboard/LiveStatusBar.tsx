/**
 * Live Status Bar — compact real-time snapshot of body state.
 * Updates on every logged action via React Query invalidation upstream.
 */
import { cn } from "@/lib/utils";

interface StatusChip {
  emoji: string;
  label: string;
  tone: "good" | "warn" | "info";
}

const TONE: Record<StatusChip["tone"], string> = {
  good: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/25",
  warn: "bg-amber-500/10 text-amber-500 ring-amber-500/25",
  info: "bg-sky-500/10 text-sky-500 ring-sky-500/25",
};

export function LiveStatusBar({
  proteinLeftG,
  waterLeftMl,
  supplementsTodayCount,
  recoveryPct,
  calorieNet,
  healthScore,
  statusLine,
}: {
  proteinLeftG: number;
  waterLeftMl: number;
  supplementsTodayCount: number;
  recoveryPct: number;
  calorieNet: number;
  healthScore: number;
  statusLine?: string;
}) {
  const chips: StatusChip[] = [
    {
      emoji: "💧",
      label: waterLeftMl > 0 ? `חסרים ${waterLeftMl} מ״ל מים` : "יעד מים הושלם",
      tone: waterLeftMl > 0 ? "warn" : "good",
    },
    {
      emoji: "🥩",
      label: proteinLeftG > 0 ? `חסרים ${proteinLeftG} גרם חלבון` : "יעד חלבון הושלם",
      tone: proteinLeftG > 0 ? "warn" : "good",
    },
    {
      emoji: "💊",
      label: supplementsTodayCount > 0 ? `תוספים היום: ${supplementsTodayCount}` : "לא נרשמו תוספים",
      tone: supplementsTodayCount > 0 ? "good" : "info",
    },
    {
      emoji: "🏋",
      label: `התאוששות ${recoveryPct}%`,
      tone: recoveryPct >= 70 ? "good" : recoveryPct >= 45 ? "info" : "warn",
    },
    {
      emoji: "🔥",
      label: `מאזן ${calorieNet >= 0 ? "+" : ""}${calorieNet}`,
      tone: calorieNet <= 0 ? "good" : calorieNet > 300 ? "warn" : "info",
    },
    {
      emoji: "❤️",
      label: `ציון בריאות ${healthScore}`,
      tone: healthScore >= 75 ? "good" : healthScore >= 55 ? "info" : "warn",
    },
  ];

  return (
    <section className="rounded-3xl border border-border/60 bg-card/60 p-4 shadow-soft backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <p className="text-xs font-medium text-muted-foreground">
          {statusLine ?? "Viora עוקב אחריך בזמן אמת"}
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <li
            key={i}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1",
              TONE[c.tone],
            )}
          >
            <span aria-hidden>{c.emoji}</span>
            <span className="text-foreground/90">{c.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
