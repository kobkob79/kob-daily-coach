/**
 * Server-authored Coach Debrief snapshot storage (Codex review findings
 * 3+4, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1). Every successful AI
 * generation is upserted here; this is the only place a "coach" section
 * shown in a Community share is allowed to read text from — never from
 * client-supplied request data, and never by calling the AI again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Best-effort: a failed save must never surface as a debrief-generation failure to the user. */
export async function saveWorkoutDebriefSnapshot(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  debrief: CoachDebrief,
): Promise<void> {
  try {
    await client.from("workout_debriefs").upsert(
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
  } catch {
    // Swallow — the caller already has a valid, already-generated debrief
    // to return to the user; a snapshot write failure only means Share
    // Studio won't have a coach section for this session later, which is
    // an explicitly supported state (AI/coach data is never required to
    // share a workout).
  }
}

export async function loadWorkoutDebriefSnapshot(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<CoachDebrief | null> {
  const { data } = await client
    .from("workout_debriefs")
    .select("greeting,paragraphs,highlights,next_focus,recovery,nutrition,hydration")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
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
}
