/**
 * Daily nutrient aggregation. Pure functions — no React, no Supabase.
 *
 * Rules:
 *  - exact values may be summed;
 *  - ranges stay ranges (they widen the daily min/max);
 *  - mixed exact + estimated produces a daily range;
 *  - units are never silently converted: a unit clash surfaces as a conflict.
 */
import {
  NUTRIENT_CONFIDENCE_LEVELS,
  type DailyNutrientTotal,
  type NutrientConfidence,
  type NutrientDefinition,
  type NutrientSourceType,
  type NutrientTarget,
  type NutrientValue,
} from "./types";

function weakest(a: NutrientConfidence, b: NutrientConfidence): NutrientConfidence {
  const rank = (c: NutrientConfidence) => NUTRIENT_CONFIDENCE_LEVELS.indexOf(c);
  return rank(a) >= rank(b) ? a : b;
}

/** Normalized unit comparison — case/space insensitive only, never converting. */
function sameUnit(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function aggregateNutrientValues(
  values: NutrientValue[],
  definitions: Map<string, NutrientDefinition>,
  targets: Map<string, NutrientTarget>,
): DailyNutrientTotal[] {
  const byKey = new Map<string, NutrientValue[]>();
  for (const v of values) {
    const bucket = byKey.get(v.key);
    if (bucket) bucket.push(v);
    else byKey.set(v.key, [v]);
  }

  const totals: DailyNutrientTotal[] = [];

  for (const [key, rows] of byKey) {
    const def = definitions.get(key) ?? null;
    const baseUnit = rows[0].unit;
    const units = Array.from(new Set(rows.map((r) => r.unit.trim())));
    const conflict = rows.some((r) => !sameUnit(r.unit, baseUnit));

    let exact: number | null = null;
    let min = 0;
    let max = 0;
    let hasRange = false;
    let confidence: NutrientConfidence = "high";
    const sources = new Set<NutrientSourceType>();

    for (const r of rows) {
      sources.add(r.sourceType);
      confidence = weakest(confidence, r.confidence);
      if (r.amount != null) {
        exact = (exact ?? 0) + r.amount;
        min += r.amount;
        max += r.amount;
      } else if (r.estimatedMin != null || r.estimatedMax != null) {
        hasRange = true;
        const lo = r.estimatedMin ?? r.estimatedMax ?? 0;
        const hi = r.estimatedMax ?? r.estimatedMin ?? 0;
        min += Math.min(lo, hi);
        max += Math.max(lo, hi);
      }
    }

    totals.push({
      key,
      definition: def,
      unit: def?.default_unit ?? baseUnit,
      exact: conflict ? null : exact,
      min: conflict ? 0 : min,
      max: conflict ? 0 : max,
      hasRange,
      confidence,
      sources: Array.from(sources),
      contributions: rows.length,
      conflict,
      ...(conflict ? { conflictingUnits: units } : {}),
      target: targets.get(key) ?? null,
    });
  }

  return totals.sort(
    (a, b) =>
      (a.definition?.sort_order ?? 9999) - (b.definition?.sort_order ?? 9999) ||
      a.key.localeCompare(b.key),
  );
}

/**
 * Progress against a stored target. Returns null when no reliable target
 * exists — never a fabricated percentage. Values above 100% are reported
 * as-is: exceeding a recommended target is not automatically unsafe. The
 * Upper Limit stays a separate signal.
 */
export function targetProgress(total: DailyNutrientTotal): {
  minPct: number;
  maxPct: number;
  overUpperLimit: boolean;
} | null {
  const target = total.target;
  if (!target || total.conflict || target.amount <= 0) return null;
  if (!sameUnit(target.unit, total.unit)) return null;
  return {
    minPct: (total.min / target.amount) * 100,
    maxPct: (total.max / target.amount) * 100,
    overUpperLimit: target.upperLimit != null && total.min > target.upperLimit,
  };
}
