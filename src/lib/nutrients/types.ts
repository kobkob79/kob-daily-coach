/**
 * Structured Nutrient Foundation — domain types.
 *
 * Core principle: a missing nutrient is NOT zero. Every quantitative value
 * carries its source and confidence, and low-confidence data may only exist
 * as a range. Nothing in this layer invents targets or precision.
 */
import type { Row } from "@/types/database";

export type NutrientDefinition = Row<"nutrient_definitions">;
export type NutrientValueRow = Row<"nutrition_entry_nutrients">;
export type NutrientTargetRow = Row<"nutrition_nutrient_targets">;

export const NUTRIENT_SOURCE_TYPES = [
  "user_entered",
  "nutrition_label",
  "usda_fdc",
  "open_food_facts",
  "ai_estimate",
  "calculated",
  "legacy",
] as const;
export type NutrientSourceType = (typeof NUTRIENT_SOURCE_TYPES)[number];

export const NUTRIENT_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type NutrientConfidence = (typeof NUTRIENT_CONFIDENCE_LEVELS)[number];

/** Application-level target types. DB values are lowercase; capitalization
 *  (RDA / AI) is display formatting only. */
export const NUTRIENT_TARGET_TYPES = ["personalized", "rda", "ai"] as const;
export type NutrientTargetType = (typeof NUTRIENT_TARGET_TYPES)[number];

/** Deterministic priority: personalized > rda > ai. */
export const NUTRIENT_TARGET_PRIORITY: Record<NutrientTargetType, number> = {
  personalized: 0,
  rda: 1,
  ai: 2,
};

export function normalizeTargetType(raw: string | null | undefined): NutrientTargetType | null {
  const v = (raw ?? "").trim().toLowerCase();
  return (NUTRIENT_TARGET_TYPES as readonly string[]).includes(v)
    ? (v as NutrientTargetType)
    : null;
}

/** Display label for a target type (capitalization is presentation only). */
export function targetTypeLabel(type: NutrientTargetType): string {
  if (type === "rda") return "RDA";
  if (type === "ai") return "AI";
  return "מותאם אישית";
}

/** A single stored nutrient value attached to one nutrition entry. */
export interface NutrientValue {
  id: string;
  entryId: string;
  key: string;
  /** Exact amount when known. Null when only a range exists. */
  amount: number | null;
  estimatedMin: number | null;
  estimatedMax: number | null;
  unit: string;
  sourceType: NutrientSourceType;
  sourceRef: string | null;
  confidence: NutrientConfidence;
}

/** Aggregated daily total for one nutrient. */
export interface DailyNutrientTotal {
  key: string;
  definition: NutrientDefinition | null;
  unit: string;
  /** Sum of exact values only (null when no exact value exists). */
  exact: number | null;
  /** Inclusive daily range: exact sum plus estimated bounds. */
  min: number;
  max: number;
  /** True when at least one contributing value was a range. */
  hasRange: boolean;
  /** Weakest confidence among contributing values — drives display. */
  confidence: NutrientConfidence;
  /** Distinct source types that contributed. */
  sources: NutrientSourceType[];
  contributions: number;
  /** Set when units conflict and no safe conversion exists. */
  conflict: boolean;
  conflictingUnits?: string[];
  target: NutrientTarget | null;
}

export interface NutrientTarget {
  amount: number;
  unit: string;
  type: NutrientTargetType;
  sourceRef: string;
  reason: string | null;
  /** Tolerable Upper Intake Level — a separate concept from the target. */
  upperLimit: number | null;
}

export interface DailyNutrientSnapshot {
  bioDay: string;
  /** Sorted by catalog sort_order; only nutrients with structured data. */
  totals: DailyNutrientTotal[];
  hasStructuredData: boolean;
}

/* ---------- Scoring contracts (Phase 1C) — contracts only, no algorithms ---------- */

export interface NutritionQualityScore {
  /** 0-100. Null until a real algorithm exists. */
  value: number | null;
  reasons: string[];
  confidence: NutrientConfidence | null;
}

export interface PersonalFitScore {
  value: number | null;
  reasons: string[];
  /** Which stored targets/profile facts the fit was derived from. */
  basedOn: string[];
}

export interface DailyNutritionScore {
  bioDay: string;
  value: number | null;
  quality: NutritionQualityScore | null;
  personalFit: PersonalFitScore | null;
  reasons: string[];
}
