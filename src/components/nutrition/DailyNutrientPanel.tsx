/**
 * Vitamins & minerals — progressive disclosure panel under the Meals daily
 * summary. Collapsed by default, mobile first, and honest about data quality:
 * only nutrients that actually have structured values are listed, never zeros.
 */
import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyNutrients } from "@/lib/nutrients/service";
import { targetProgress } from "@/lib/nutrients/aggregate";
import { targetTypeLabel } from "@/lib/nutrients/types";
import type { DailyNutrientTotal, NutrientConfidence } from "@/lib/nutrients/types";

const CONFIDENCE_HE: Record<NutrientConfidence, string> = {
  high: "מהימנות גבוהה",
  medium: "מהימנות בינונית",
  low: "מהימנות נמוכה",
};

const SOURCE_HE: Record<string, string> = {
  user_entered: "הוזן ידנית",
  nutrition_label: "תווית תזונה",
  usda_fdc: "מסד USDA",
  open_food_facts: "Open Food Facts",
  ai_estimate: "הערכת AI",
  calculated: "חישוב",
  legacy: "נתון היסטורי",
};

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100) return String(Math.round(n));
  if (abs >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** Value text respects confidence: exact, approximate, or a real range. */
function valueLabel(total: DailyNutrientTotal): string {
  if (total.conflict) return "נתונים לא תואמים";
  if (total.hasRange && total.max > total.min) return `≈ ${fmt(total.min)}–${fmt(total.max)}`;
  const v = total.exact ?? total.min;
  return total.confidence === "high" ? fmt(v) : `≈ ${fmt(v)}`;
}

export function DailyNutrientPanel({ bioDay }: { bioDay: string }) {
  const [open, setOpen] = useState(false);
  const { snapshot, isLoading, error } = useDailyNutrients(bioDay);

  // Vitamins & minerals only: hydration, macro and energy nutrients never
  // belong in this panel, and an unknown/missing category is not assumed.
  const micros = (snapshot?.totals ?? []).filter((t) => t.definition?.category === "micro");

  return (
    <div className="mt-3 rounded-2xl border border-border/40 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-3 text-start"
      >
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">ויטמינים ומינרלים</span>
          {micros.length > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
              {micros.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 px-3.5 py-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">טוען נתונים תזונתיים…</p>
          ) : error ? (
            <p className="text-xs text-destructive">לא הצלחנו לטעון את הנתונים התזונתיים.</p>
          ) : micros.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              עדיין אין מספיק מידע תזונתי מפורט לארוחות היום.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {micros.map((t) => (
                <NutrientRow key={t.key} total={t} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NutrientRow({ total }: { total: DailyNutrientTotal }) {
  const progress = targetProgress(total);
  const sources = total.sources.map((s) => SOURCE_HE[s] ?? s).join(" · ");

  return (
    <li className="rounded-xl bg-card/50 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {total.definition?.display_name_he ?? total.key}
        </span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {valueLabel(total)}{" "}
          {!total.conflict && (
            <span className="text-[11px] font-normal text-muted-foreground">{total.unit}</span>
          )}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {CONFIDENCE_HE[total.confidence]}
        {sources && ` · ${sources}`}
      </p>

      {progress && total.target && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${Math.min(100, Math.round(progress.maxPct))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {progress.minPct === progress.maxPct
              ? `${Math.round(progress.maxPct)}%`
              : `${Math.round(progress.minPct)}–${Math.round(progress.maxPct)}%`}
            {" "}מהיעד ({targetTypeLabel(total.target.type)} · {fmt(total.target.amount)}{" "}
            {total.target.unit})
          </p>
          {total.target.upperLimit != null && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              גבול עליון (UL): {fmt(total.target.upperLimit)} {total.target.unit}
            </p>
          )}
          {progress.overUpperLimit && (
            <p className="mt-0.5 text-[10px] text-amber-400">מעל הגבול העליון המומלץ</p>
          )}
        </div>
      )}

      {total.conflict && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          יחידות שונות ({total.conflictingUnits?.join(", ")}) — לא בוצע סיכום.
        </p>
      )}
    </li>
  );
}
