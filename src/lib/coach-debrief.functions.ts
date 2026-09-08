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
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { ctx?: unknown; sessionId?: unknown };
    return {
      ctx: (raw.ctx ?? {}) as CoachDebriefContext,
      sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
    };
  })
  .handler(async ({ data, context }): Promise<CoachDebriefResult> => {
    const { generateCoachDebriefResult } = await import("./coach-debrief.server");
    const result = await generateCoachDebriefResult(data.ctx, {
      apiKey: process.env.OPENAI_API_KEY,
    });
    if (result.status === "ok" && data.sessionId) {
      const { saveWorkoutDebriefSnapshot } = await import("./coach-debrief-persistence.server");
      await saveWorkoutDebriefSnapshot(
        context.supabase,
        String(context.userId),
        data.sessionId,
        result.debrief,
      );
    }
    return result;
  });

export type WorkoutDebriefSnapshotResult =
  { status: "found"; debrief: CoachDebrief } | { status: "not_found" };

/**
 * Read-only — never triggers AI generation. This is what Share Studio uses:
 * opening it (including a direct URL visit or a refresh) never causes an
 * OpenAI call, it only reads whatever the debrief screen already generated
 * and saved for this session, if anything.
 */
export const getWorkoutDebriefSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown };
    return { sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "" };
  })
  .handler(async ({ data, context }): Promise<WorkoutDebriefSnapshotResult> => {
    if (!data.sessionId) return { status: "not_found" };
    const { loadWorkoutDebriefSnapshot } = await import("./coach-debrief-persistence.server");
    const debrief = await loadWorkoutDebriefSnapshot(
      context.supabase,
      String(context.userId),
      data.sessionId,
    );
    return debrief ? { status: "found", debrief } : { status: "not_found" };
  });
