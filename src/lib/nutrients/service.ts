/**
 * Nutrient data access + React Query hooks.
 *
 * Data → service → daily aggregation → UI. The UI owns no nutrient logic.
 * Exactly three queries per day view (catalog, day values, active targets) —
 * never one per meal or per nutrient.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aggregateNutrientValues } from "./aggregate";
import {
  NUTRIENT_TARGET_PRIORITY,
  normalizeTargetType,
  type NutrientTargetRow,
  type NutrientTargetType,
  type DailyNutrientSnapshot,
  type NutrientConfidence,
  type NutrientDefinition,
  type NutrientSourceType,
  type NutrientTarget,
  type NutrientValue,
} from "./types";

export async function fetchNutrientDefinitions(): Promise<NutrientDefinition[]> {
  const { data, error } = await supabase
    .from("nutrient_definitions")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** All structured nutrient values for one biological day, in one query. */
export async function fetchNutrientValuesForDay(bioDay: string): Promise<NutrientValue[]> {
  const { data, error } = await supabase
    .from("nutrition_entry_nutrients")
    .select(
      "id,nutrition_entry_id,nutrient_key,amount,estimated_min,estimated_max,unit,source_type,source_ref,confidence,nutrition_entries!inner(biological_day)",
    )
    .eq("nutrition_entries.biological_day", bioDay);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    entryId: r.nutrition_entry_id,
    key: r.nutrient_key,
    amount: r.amount == null ? null : Number(r.amount),
    estimatedMin: r.estimated_min == null ? null : Number(r.estimated_min),
    estimatedMax: r.estimated_max == null ? null : Number(r.estimated_max),
    unit: r.unit,
    sourceType: r.source_type as NutrientSourceType,
    sourceRef: r.source_ref,
    confidence: (r.confidence as NutrientConfidence) ?? "medium",
  }));
}

/**
 * Active, currently effective stored targets. Never invented in code.
 *
 * Selection is deterministic when several active targets exist for the same
 * nutrient: personalized > rda > ai, then the most recent effective_from,
 * then updated_at, created_at and finally id as a stable tie-breaker.
 */
export async function fetchActiveNutrientTargets(
  onDate: string,
): Promise<Map<string, NutrientTarget>> {
  const { data, error } = await supabase
    .from("nutrition_nutrient_targets")
    .select("*")
    .eq("is_active", true)
    .lte("effective_from", onDate);
  if (error) throw error;

  const candidates = new Map<string, { row: NutrientTargetRow; type: NutrientTargetType }>();
  const cmpDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

  for (const r of (data ?? []) as NutrientTargetRow[]) {
    if (r.effective_to && r.effective_to < onDate) continue;
    const type = normalizeTargetType(r.target_type);
    if (!type) continue; // unknown target type: never guessed
    const cur = candidates.get(r.nutrient_key);
    if (!cur) {
      candidates.set(r.nutrient_key, { row: r, type });
      continue;
    }
    const better =
      NUTRIENT_TARGET_PRIORITY[type] - NUTRIENT_TARGET_PRIORITY[cur.type] ||
      cmpDesc(r.effective_from, cur.row.effective_from) ||
      cmpDesc(r.updated_at, cur.row.updated_at) ||
      cmpDesc(r.created_at, cur.row.created_at) ||
      cmpDesc(r.id, cur.row.id);
    if (better < 0) candidates.set(r.nutrient_key, { row: r, type });
  }

  const map = new Map<string, NutrientTarget>();
  for (const [key, { row, type }] of candidates) {
    map.set(key, {
      amount: Number(row.target_amount),
      unit: row.unit,
      type,
      sourceRef: row.source_ref,
      reason: row.reason,
      upperLimit: row.upper_limit == null ? null : Number(row.upper_limit),
    });
  }
  return map;
}

export function useDailyNutrients(bioDay: string) {
  const definitionsQ = useQuery({
    queryKey: ["nutrient-definitions"],
    queryFn: fetchNutrientDefinitions,
    staleTime: 60 * 60_000,
  });

  const valuesQ = useQuery({
    queryKey: ["nutrient-values", bioDay],
    queryFn: () => fetchNutrientValuesForDay(bioDay),
  });

  const targetsQ = useQuery({
    queryKey: ["nutrient-targets", bioDay],
    queryFn: () => fetchActiveNutrientTargets(bioDay),
    staleTime: 10 * 60_000,
  });

  const snapshot = useMemo<DailyNutrientSnapshot | null>(() => {
    if (!definitionsQ.data || !valuesQ.data) return null;
    const defs = new Map(definitionsQ.data.map((d) => [d.key, d]));
    const totals = aggregateNutrientValues(
      valuesQ.data,
      defs,
      targetsQ.data ?? new Map(),
    );
    return { bioDay, totals, hasStructuredData: totals.length > 0 };
  }, [definitionsQ.data, valuesQ.data, targetsQ.data, bioDay]);

  return {
    snapshot,
    isLoading: definitionsQ.isLoading || valuesQ.isLoading,
    error: definitionsQ.error ?? valuesQ.error ?? targetsQ.error ?? null,
  };
}
