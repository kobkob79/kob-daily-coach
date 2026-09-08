/**
 * Orchestrates a single generateCoachDebrief request (Codex re-review
 * round 3, F1+F2, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Extracted out of coach-debrief.functions.ts's createServerFn handler so
 * the real, end-to-end wiring — context verification, then AI generation,
 * then the snapshot write — is directly testable under plain node --test
 * without a TanStack Start test harness. The createServerFn handler is a
 * thin wrapper that calls runGenerateCoachDebrief with no overrides; tests
 * call it directly with fake clients/a fake generator.
 *
 * Relative imports with explicit ".ts" extensions (not "@/...") so this
 * file's colocated test suite can import it directly — see
 * community-workout-share.server.ts for the same convention and the
 * reason (Node's ESM loader doesn't resolve Vite's "@/" alias).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../integrations/supabase/client.server.ts";
import { buildVerifiedDebriefContext } from "./coach-debrief-context.server.ts";
import { saveWorkoutDebriefSnapshot } from "./coach-debrief-persistence.server.ts";
import { buildDebriefFailure, type CoachDebriefResult } from "./coach-debrief-safety.ts";
import type { CoachDebriefContext } from "./coach-debrief.functions";

export interface RunGenerateCoachDebriefOptions {
  /** Defaults to the real supabaseAdmin (service_role) singleton. */
  adminClient?: SupabaseClient;
  /**
   * Overridable purely for testing — the real path dynamically imports
   * coach-debrief.server.ts's generateCoachDebriefResult (an actual
   * OpenAI call), so a test can substitute a synthetic result and never
   * need a live API key, network access, or the real OpenAI wire format.
   */
  generateDebrief?: (ctx: CoachDebriefContext) => Promise<CoachDebriefResult>;
}

async function generateDebriefViaOpenAI(ctx: CoachDebriefContext): Promise<CoachDebriefResult> {
  const { generateCoachDebriefResult } = await import("./coach-debrief.server.ts");
  return generateCoachDebriefResult(ctx, { apiKey: process.env.OPENAI_API_KEY });
}

/**
 * The complete generateCoachDebrief flow: verify ownership and rebuild the
 * context server-side (never trusting anything but sessionId + the
 * caller's own verified identity), generate the debrief, and — on success
 * only — persist a snapshot via the service-role admin client (never the
 * caller's own RLS-scoped client: workout_debriefs is read-only for
 * `authenticated` as of the round-2 RLS tightening, so a write via the
 * caller's client would silently fail every time). A foreign or unknown
 * sessionId returns INVALID_REQUEST before `generate` is ever called —
 * no OpenAI call, no write, for a session that isn't provably the
 * caller's own.
 */
export async function runGenerateCoachDebrief(
  authClient: SupabaseClient,
  userId: string,
  sessionId: string,
  options: RunGenerateCoachDebriefOptions = {},
): Promise<CoachDebriefResult> {
  const ctx = await buildVerifiedDebriefContext(authClient, userId, sessionId);
  if (!ctx) return buildDebriefFailure("INVALID_REQUEST");

  const generate = options.generateDebrief ?? generateDebriefViaOpenAI;
  const result = await generate(ctx);

  if (result.status === "ok") {
    const admin = options.adminClient ?? supabaseAdmin;
    // Best-effort (Codex review findings 3+4, round 1): a failed save
    // must never surface as a debrief-generation failure — the caller
    // already has a valid, already-generated debrief to return. The
    // failure itself is still logged server-side (never rethrown) by
    // saveWorkoutDebriefSnapshot itself.
    await saveWorkoutDebriefSnapshot(admin, userId, sessionId, result.debrief);
  }
  return result;
}
