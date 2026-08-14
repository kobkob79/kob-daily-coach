/**
 * Nutrient unit handling. Conversions are explicit and numeric only — a value
 * is NEVER relabelled from its stored unit into a different display unit.
 * Anything not covered here is a real unit conflict.
 */

/** Canonical form for comparison: case/space insensitive, no conversion. */
export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sameUnit(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

/** Supported mass/volume factors, expressed relative to a base unit. */
const MASS: Record<string, { base: string; factor: number }> = {
  g: { base: "g", factor: 1 },
  gram: { base: "g", factor: 1 },
  grams: { base: "g", factor: 1 },
  mg: { base: "g", factor: 1e-3 },
  mcg: { base: "g", factor: 1e-6 },
  µg: { base: "g", factor: 1e-6 },
  ug: { base: "g", factor: 1e-6 },
  l: { base: "ml", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  // Retinol / folate equivalents: same magnitude family, distinct base so they
  // never mix with plain mass units.
  "mcg rae": { base: "rae", factor: 1e-6 },
  "mg rae": { base: "rae", factor: 1e-3 },
  "mcg dfe": { base: "dfe", factor: 1e-6 },
  "mg dfe": { base: "dfe", factor: 1e-3 },
  kcal: { base: "kcal", factor: 1 },
  iu: { base: "iu", factor: 1 },
};

/**
 * Convert `value` from `from` into `to`. Returns null when no supported
 * numeric conversion exists — callers must then treat it as a unit conflict.
 */
export function convertUnit(value: number, from: string, to: string): number | null {
  if (sameUnit(from, to)) return value;
  const a = MASS[normalizeUnit(from)];
  const b = MASS[normalizeUnit(to)];
  if (!a || !b || a.base !== b.base) return null;
  return (value * a.factor) / b.factor;
}

export function canConvert(from: string, to: string): boolean {
  return convertUnit(1, from, to) != null;
}
