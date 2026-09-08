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
// One canonical sessionId format check for both handlers below (Codex
// re-review round 4, F2) — see coach-debrief-session-id.ts for why it's a
// standalone module rather than living in coach-debrief-safety.ts or
// coach-debrief-orchestration.server.ts.
import { SESSION_ID_RE } from "@/lib/coach-debrief-session-id";

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
    const raw = (input ?? {}) as { sessionId?: unknown };
    return { sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "" };
  })
  // SECURITY (Codex re-review round 2, blockers 2+3; round 3, F1+F2): the
  // context this handler feeds the AI used to be sent whole by the client
  // (`ctx`) and trusted outright. The client now sends only `sessionId`;
  // the real work — verifying ownership, rebuilding the context
  // server-side, generating, and persisting the result via the
  // service-role admin client (never the caller's own RLS-scoped client,
  // which workout_debriefs' RLS makes read-only) — lives in
  // runGenerateCoachDebrief (coach-debrief-orchestration.server.ts),
  // which is directly tested end-to-end there rather than only through
  // this thin handler.
  .handler(async ({ data, context }): Promise<CoachDebriefResult> => {
    if (!SESSION_ID_RE.test(data.sessionId)) {
      const { buildDebriefFailure } = await import("./coach-debrief-safety");
      return buildDebriefFailure("INVALID_REQUEST");
    }
    const { runGenerateCoachDebrief } = await import("./coach-debrief-orchestration.server");
    return runGenerateCoachDebrief(context.supabase, String(context.userId), data.sessionId);
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
  // SECURITY (Codex re-review round 4, F2): same UUID check as
  // generateCoachDebrief (same imported SESSION_ID_RE) — a malformed
  // sessionId is rejected here before the dynamic import even runs, and
  // again inside runGetWorkoutDebriefSnapshot itself, so no DB query or
  // client access happens for anything that can never be a real session
  // id. Resolves to the same "not_found" a genuinely unknown-but-well-
  // formed session id would.
  .handler(async ({ data, context }): Promise<WorkoutDebriefSnapshotResult> => {
    if (!SESSION_ID_RE.test(data.sessionId)) return { status: "not_found" };
    const { runGetWorkoutDebriefSnapshot } = await import("./coach-debrief-orchestration.server");
    return runGetWorkoutDebriefSnapshot(context.supabase, String(context.userId), data.sessionId);
  });
