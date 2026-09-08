/**
 * Coach Debrief — the post-workout conversation between Viora and the athlete.
 *
 * Receives a compact snapshot of the finished session (planned vs done,
 * volume, rest behaviour, failed sets, PRs, duration, feedback) and asks the
 * AI gateway for a short, natural Hebrew debrief. The AI decides which topics
 * matter; nothing is templated on our side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CoachDebriefResult } from "@/lib/coach-debrief-safety";

export interface DebriefExercise {
  name: string;
  plannedSets: number;
  completedSets: number;
  topWeightKg: number | null;
  topReps: number | null;
  volumeKg: number;
  isPR: boolean;
  prevBestKg: number | null;
  avgRestSeconds: number | null;
  plannedRestSeconds: number | null;
  repsDropped: boolean;
  /** Estimated 1RM this session vs. the best before it (Epley). */
  e1rmKg: number | null;
  prevE1rmKg: number | null;
  weightDeltaKg: number | null;
}

export interface CoachDebriefContext {
  now: string;
  displayName: string;
  workoutName: string | null;
  durationMinutes: number;
  totalVolumeKg: number;
  prevVolumeKg: number | null;
  /** Consistency + progression signals used for concrete, non-generic feedback. */
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  avgVolumeLast4WorkoutsKg: number | null;
  volumeTrendPct: number | null;
  completionRatePct: number;
  plannedSets: number;
  completedSets: number;
  skippedSets: number;
  difficulty: number | null;
  energy: number | null;
  pain: string | null;
  notes: string | null;
  daysSinceLastWorkout: number | null;
  exercises: DebriefExercise[];
  nextWorkoutName: string | null;
}

export interface CoachDebrief {
  greeting: string;
  paragraphs: string[];
  highlights: string[];
  nextFocus: string | null;
  recovery: string | null;
  nutrition: string | null;
  hydration: string | null;
}

export const generateCoachDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ ctx: (input ?? {}) as CoachDebriefContext }))
  .handler(async ({ data }): Promise<CoachDebriefResult> => {
    const { generateCoachDebriefResult } = await import("./coach-debrief.server");
    return generateCoachDebriefResult(data.ctx, { apiKey: process.env.OPENAI_API_KEY });
  });
