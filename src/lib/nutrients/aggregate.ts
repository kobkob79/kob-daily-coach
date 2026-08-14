/**
 * Daily nutrient aggregation. Pure functions — no React, no Supabase.
 *
 * Rules:
 *  - exact values may be summed;
 *  - ranges stay ranges (they widen the daily min/max);
 *  - mixed exact + estimated produces a daily range;
 *  - units are converted only through explicit numeric conversions; anything
 *    else is a real unit conflict and is never aggregated as if compatible.
 */
import { convertUnit, sameUnit } from "./units";
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
    // Display/aggregation unit: the catalog default when every stored value can
    // be converted into it; otherwise the first stored unit.
    const preferred = def?.default_unit ?? rows[0].unit;
    const targetUnit = rows.every((r) => convertUnit(1, r.unit, preferred) != null)
      ? preferred
      : rows[0].unit;

    const units = Array.from(new Set(rows.map((r) => r.unit.trim())));
    const conflict = rows.some(
      (r) => !sameUnit(r.unit, targetUnit) && convertUnit(1, r.unit, targetUnit) == null,
    );

    let exact: number | null = null;
    let min = 0;
    let max = 0;
    let hasRange = false;
    let confidence: NutrientConfidence = "high";
    const sources = new Set<NutrientSourceType>();

    if (!conflict) {
      for (const r of rows) {
        sources.add(r.sourceType);
        confidence = weakest(confidence, r.confidence);
        const conv = (n: number) => convertUnit(n, r.unit, targetUnit) ?? n;
        if (r.amount != null) {
          const v = conv(r.amount);
          exact = (exact ?? 0) + v;
          min += v;
          max += v;
        } else if (r.estimatedMin != null || r.estimatedMax != null) {
          hasRange = true;
          const lo = conv(r.estimatedMin ?? r.estimatedMax ?? 0);
          const hi = conv(r.estimatedMax ?? r.estimatedMin ?? 0);
          min += Math.min(lo, hi);
          max += Math.max(lo, hi);
        }
      }
    } else {
      for (const r of rows) {
        sources.add(r.sourceType);
        confidence = weakest(confidence, r.confidence);
      }
    }

    totals.push({
      key,
      definition: def,
      unit: targetUnit,
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
  const amount = convertUnit(target.amount, target.unit, total.unit);
  if (amount == null || amount <= 0) return null;
  const ul =
    target.upperLimit == null ? null : convertUnit(target.upperLimit, target.unit, total.unit);
  return {
    minPct: (total.min / amount) * 100,
    maxPct: (total.max / amount) * 100,
    overUpperLimit: ul != null && total.min > ul,
  };
}
