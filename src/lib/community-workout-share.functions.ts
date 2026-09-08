/**
 * Community Share Studio — Workout Result publishing (Phase 1,
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Thin createServerFn wrappers; the actual Supabase-touching logic lives in
 * community-workout-share.server.ts (mirrors coach-debrief.functions.ts /
 * coach-debrief.server.ts) so it stays server-only and dynamically
 * imported.
 *
 * Input is strictly validated (Codex review finding 2) — a request that
 * doesn't parse is rejected before any database access, never with an
 * internal error or any detail beyond "invalid input". There is
 * deliberately no `coach` field here anymore (Codex review findings 3+4):
 * the server reads the debrief text itself from the persisted snapshot
 * (coach-debrief-persistence.server.ts) rather than trusting client-
 * supplied narrative text — `includeCoach` is only ever a presentation
 * choice, never a text source.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  publishInputSchema,
  sessionIdSchema,
  type PublishWorkoutShareInput,
} from "./community-workout-share-validation";
import type { WorkoutSharePayload } from "./community-workout-share";

export type WorkoutShareAudience = "public" | "followers";
export type { PublishWorkoutShareInput };

export type PublishWorkoutShareResult =
  | { status: "published"; postId: string; payload: WorkoutSharePayload }
  | { status: "already_shared"; postId: string; payload: WorkoutSharePayload }
  | {
      status: "error";
      reason:
        "INVALID_INPUT" | "SESSION_NOT_FOUND" | "SESSION_NOT_COMPLETED" | "PERSISTENCE_UNAVAILABLE";
    };

export const publishWorkoutShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const result = publishInputSchema.safeParse(input);
    return result.success ? result.data : null;
  })
  .handler(async ({ data, context }): Promise<PublishWorkoutShareResult> => {
    if (!data) return { status: "error", reason: "INVALID_INPUT" };
    const { publishWorkoutShareResult } = await import("./community-workout-share.server");
    return publishWorkoutShareResult(context.supabase, String(context.userId), data);
  });

export type ExistingWorkoutShareResult =
  | { status: "found"; postId: string; payload: WorkoutSharePayload; photoPath: string | null }
  | { status: "not_found" };

export const findExistingWorkoutShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const result = sessionIdSchema.safeParse(input);
    return result.success ? result.data : null;
  })
  .handler(async ({ data, context }): Promise<ExistingWorkoutShareResult> => {
    if (!data) return { status: "not_found" };
    const { findExistingWorkoutShareResult } = await import("./community-workout-share.server");
    return findExistingWorkoutShareResult(context.supabase, String(context.userId), data.sessionId);
  });
