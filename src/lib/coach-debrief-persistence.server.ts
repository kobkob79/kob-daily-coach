/**
 * Server-authored Coach Debrief snapshot storage (Codex review findings
 * 3+4, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1). Every successful AI
 * generation is upserted here; this is the only place a "coach" section
 * shown in a Community share is allowed to read text from — never from
 * client-supplied request data, and never by calling the AI again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logDebriefSafeFailure } from "./coach-debrief-safety.ts";
import type { CoachDebrief } from "./coach-debrief.functions";

interface WorkoutDebriefRow {
  greeting: string;
  paragraphs: string[];
  highlights: string[];
  next_focus: string | null;
  recovery: string | null;
  nutrition: string | null;
  hydration: string | null;
}

/**
 * Best-effort: a failed save must never surface as a debrief-generation
 * failure to the user, so this never throws. It must not silently look
 * like success either (Codex re-review round 2, blocker 4) — supabase-js
 * resolves a business-logic failure (RLS denial, the ownership-verifying
 * trigger raising, a constraint violation) as `{ error }`, it does not
 * reject the promise, so a bare try/catch around the call never sees it.
 * The `{ error }` case is checked explicitly, logged via
 * logDebriefSafeFailure (Codex re-review round 4, F1 — a fixed event name
 * and a fresh correlationId only, never `error.message`/`error.code`, the
 * raw `error` object, sessionId, or userId), and reflected in the
 * returned boolean so a test (or a future caller) can tell a real save
 * from a swallowed failure.
 */
export async function saveWorkoutDebriefSnapshot(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  debrief: CoachDebrief,
): Promise<boolean> {
  try {
    const { error } = await client.from("workout_debriefs").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        greeting: debrief.greeting,
        paragraphs: debrief.paragraphs,
        highlights: debrief.highlights,
        next_focus: debrief.nextFocus,
        recovery: debrief.recovery,
        nutrition: debrief.nutrition,
        hydration: debrief.hydration,
      },
      { onConflict: "session_id" },
    );
    if (error) {
      logDebriefSafeFailure("coach_debrief_snapshot_save_failed");
      return false;
    }
    return true;
  } catch {
    // A thrown exception (network failure, not a business-logic error
    // response) is just as much a failed save as an `{ error }` result —
    // still swallowed toward the caller, still logged, still reported as
    // "did not save" via the return value.
    logDebriefSafeFailure("coach_debrief_snapshot_save_failed");
    return false;
  }
}

export async function loadWorkoutDebriefSnapshot(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<CoachDebrief | null> {
  try {
    const { data, error } = await client
      .from("workout_debriefs")
      .select("greeting,paragraphs,highlights,next_focus,recovery,nutrition,hydration")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Same reasoning as the save path: a query error resolves as
      // `{ error }`, not a throw. Treated as "no snapshot available" (the
      // safe default an already-supported state — Share Studio's coach
      // section is optional) but logged via logDebriefSafeFailure rather
      // than silently indistinguishable from a genuinely empty table.
      logDebriefSafeFailure("coach_debrief_snapshot_load_failed");
      return null;
    }
    if (!data) return null;
    const row = data as WorkoutDebriefRow;
    return {
      greeting: row.greeting,
      paragraphs: row.paragraphs,
      highlights: row.highlights,
      nextFocus: row.next_focus,
      recovery: row.recovery,
      nutrition: row.nutrition,
      hydration: row.hydration,
    };
  } catch {
    // Codex re-review round 4, F1: symmetric with saveWorkoutDebriefSnapshot
    // — a thrown exception (not the `{ error }` resolution above) is just
    // as much a failed load, treated the same safe way (unavailable, not
    // an error the caller has to handle specially).
    logDebriefSafeFailure("coach_debrief_snapshot_load_failed");
    return null;
  }
}
