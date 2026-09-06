/**
 * Server function that produces the Viora daily AI brief.
 *
 * Receives a compact context snapshot from the client and calls OpenAI
 * (direct key) to generate a Hebrew, personalized daily coaching brief.
 * Fails soft — when the provider key is missing or the call errors, the
 * brief is marked `unavailable` so the dashboard silently hides the card.
 *
 * The OpenAI calls live in daily-brief.server.ts and are imported
 * dynamically inside the handler so server-only modules never enter the
 * client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DailyBriefContext {
  now: string;
  displayName: string;
  shift: string | null;
  proteinToday: number;
  proteinTarget: number;
  caloriesEaten: number;
  caloriesBurned: number;
  calorieTarget: number | null;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  waterMlToday: number;
  waterTargetMl: number;
  workoutTodayMinutes: number;
  workoutYesterdayMinutes: number;
  lastSleepHours: number | null;
  avgSleepHours: number | null;
  currentWeightKg: number | null;
  weightDelta30dKg: number | null;
  pain: { area: string; level: number } | null;
  supplementsToday: string[];
  supplementsHabitual: string[];
  meals: Array<{ name: string; protein_g: number; calories: number }>;
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null;
  recoveryPct: number;
  hydrationPct: number;
  energyPct: number;
  healthScore: number;
}

export interface DailyBrief {
  hero: string;
  statusLine: string;
  analysis: Array<{ title: string; body: string; emoji: string }>;
  supplementAnalysis: Array<{ name: string; benefit: string }>;
  wellDone: string[];
  improve: string[];
  mission: string[];
  learned: string[];
  calorieVerdict: string;
  diagnostics: { model: string; duration_ms: number };
}

export type DailyBriefResult =
  | { status: "available"; brief: DailyBrief }
  | { status: "unavailable"; reason: "not_configured" | "provider_error" };

export const generateDailyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const ctx = (input ?? {}) as DailyBriefContext;
    return { ctx };
  })
  .handler(async ({ data }): Promise<DailyBriefResult> => {
    const { generateDailyBriefResult } = await import("./daily-brief.server");
    return generateDailyBriefResult(data.ctx, { apiKey: process.env.OPENAI_API_KEY });
  });
