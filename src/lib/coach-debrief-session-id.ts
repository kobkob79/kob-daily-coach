/**
 * Canonical sessionId format check, shared by generateCoachDebrief and
 * getWorkoutDebriefSnapshot (Codex re-review round 4, F2) — one source so
 * the two request paths can never silently drift apart on what counts as
 * a well-formed session id.
 *
 * Deliberately its own standalone, dependency-free module — not
 * coach-debrief-safety.ts and not coach-debrief-orchestration.server.ts:
 * coach-debrief.functions.ts ships to the client bundle and needs to
 * import this statically (the input-validator/pre-check runs
 * synchronously, before any dynamic import), so the shared module must
 * never risk pulling in anything server-only (coach-debrief-orchestration
 * .server.ts re-exports supabaseAdmin). This file has zero imports of its
 * own, so it's equally safe to import relatively (with the explicit ".ts"
 * extension) from a colocated node --test suite.
 */
export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
