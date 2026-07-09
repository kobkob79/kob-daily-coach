/**
 * AI Memory — durable per-user key/value store the Smart Coach consults
 * to avoid re-asking questions and to personalise nudges.
 *
 * All state lives in the `ai_memory` Postgres table; nothing is kept in
 * localStorage. Pure Supabase read/write helpers + a couple of typed
 * accessors for the well-known keys the coach currently uses.
 */
import { supabase } from "@/integrations/supabase/client";

export type AiMemoryKey =
  | "profile"
  | "favorites_top"
  | "supplements"
  | "sleep"
  | "meal_habits"
  | "weight_trend"
  | "pain_state"
  | "coach_seen"
  | "personal_facts"    // string[] of remembered personal facts
  | `day_intake:${string}` // morning intake per biological day
  | `day_targets:${string}`; // derived targets per biological day

export async function getMemory<T = unknown>(key: AiMemoryKey): Promise<T | null> {
  const { data, error } = await supabase
    .from("ai_memory")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return null;
  return (data?.value as T) ?? null;
}

export async function setMemory<T = unknown>(key: AiMemoryKey, value: T): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase
    .from("ai_memory")
    .upsert(
      { user_id: u.user.id, key, value: value as never },
      { onConflict: "user_id,key" },
    );
}

export async function patchMemory<T extends Record<string, unknown>>(
  key: AiMemoryKey,
  patch: Partial<T>,
): Promise<void> {
  const current = (await getMemory<T>(key)) ?? ({} as T);
  await setMemory<T>(key, { ...current, ...patch });
}

export async function getAllMemory(): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("ai_memory").select("key,value");
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}
