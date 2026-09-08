/**
 * Community Share Studio — Workout Result publishing (Phase 1,
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Thin createServerFn wrappers; the actual Supabase-touching logic lives in
 * community-workout-share.server.ts (mirrors coach-debrief.functions.ts /
 * coach-debrief.server.ts) so it stays server-only and dynamically
 * imported.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkoutShareCoachInput, WorkoutSharePayload } from "./community-workout-share";

export type WorkoutShareAudience = "public" | "followers";

export interface PublishWorkoutShareInput {
  sessionId: string;
  caption: string | null;
  photoPath: string | null;
  audience: WorkoutShareAudience;
  /** Human-readable label the user typed/picked for this post only — never inherited, never coordinates. */
  locationLabel: string | null;
  /** Whether the coach section toggle was on. */
  includeCoach: boolean;
  /** The debrief text the client already fetched/showed in the preview — never regenerated server-side. Ignored when includeCoach is false. */
  coach: WorkoutShareCoachInput | null;
}

export type PublishWorkoutShareResult =
  | { status: "published"; postId: string; payload: WorkoutSharePayload }
  | { status: "already_shared"; postId: string; payload: WorkoutSharePayload }
  | {
      status: "error";
      reason: "SESSION_NOT_FOUND" | "SESSION_NOT_COMPLETED" | "PERSISTENCE_UNAVAILABLE";
    };

export const publishWorkoutShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => (input ?? {}) as PublishWorkoutShareInput)
  .handler(async ({ data, context }): Promise<PublishWorkoutShareResult> => {
    const { publishWorkoutShareResult } = await import("./community-workout-share.server");
    return publishWorkoutShareResult(context.supabase, String(context.userId), data);
  });

export type ExistingWorkoutShareResult =
  { status: "found"; postId: string; payload: WorkoutSharePayload } | { status: "not_found" };

export const findExistingWorkoutShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => (input ?? {}) as { sessionId: string })
  .handler(async ({ data, context }): Promise<ExistingWorkoutShareResult> => {
    const { findExistingWorkoutShareResult } = await import("./community-workout-share.server");
    return findExistingWorkoutShareResult(context.supabase, String(context.userId), data.sessionId);
  });
