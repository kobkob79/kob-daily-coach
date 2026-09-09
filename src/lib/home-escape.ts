/**
 * VIORA NAV-001 — Global Home Escape.
 *
 * Single source of truth for "does this screen already give the user a
 * one-tap, history-independent path to the real home route, or does it need
 * the shared HomeEscapeButton — and if so, what should leaving it warn
 * about?" Kept as pure functions (no React, no router instance) so the
 * decision logic is unit-testable with `node --test` — this repo has no
 * React render harness (see src/hooks/usePrefersReducedMotion.test.ts).
 */

/** The one true home route. Never derived from history. */
export const HOME_ROUTE = "/dashboard";

/**
 * The in-progress workout flow (overview, per-exercise focus, brief,
 * summary, coach debrief + export) is the only place AppShell hides its
 * bottom nav (see hideBottomNav in AppShell.tsx) — so it's the only place
 * that loses the built-in one-tap-home tab. This is intentionally broad
 * (every sub-route of the session) since all six need the button shown;
 * which of them also need a leave-confirmation, and what it should say, is
 * decided separately by homeEscapeConfirmKind below.
 */
export function isWorkoutSessionRoute(pathname: string): boolean {
  return pathname.startsWith("/workouts/session/");
}

/**
 * True when the screen at `pathname` already renders AppShell's bottom nav
 * (with its "בית" tab), i.e. a direct, history-independent path home is
 * already visible one tap away.
 */
export function hasVisibleBottomNavHome(pathname: string): boolean {
  return !isWorkoutSessionRoute(pathname);
}

/**
 * Whether the shared HomeEscapeButton should render on this screen.
 * Never shown on the home route itself, and never shown where the bottom
 * nav already provides a direct way home (no duplicate escape hatches).
 */
export function shouldShowHomeEscapeButton(pathname: string): boolean {
  if (pathname === HOME_ROUTE) return false;
  return !hasVisibleBottomNavHome(pathname);
}

/**
 * - "active_workout": the overview and per-exercise screens, where the
 *   athlete is actively editing sets. Every field there already commits on
 *   blur (see the overview route's patchMut), so the confirmation must stay
 *   neutral — it never promises that *everything* is saved, only that the
 *   workout keeps running and stays reachable.
 * - "unsaved_summary": the post-workout summary screen. Difficulty,
 *   energy, pain and notes live in local useState there and are only
 *   persisted by finalizeSession() when the athlete taps "שמור אימון" — so
 *   leaving before that tap genuinely discards them. The confirmation must
 *   say so plainly, not imply they're safe.
 * - null: brief, debrief and debrief/export hold no locally-entered,
 *   unsaved athlete input (brief is pre-workout read-only briefing;
 *   debrief/export are post-finalize, read-only AI output with Copy/Share
 *   actions) — Home navigates straight there, no prompt.
 *
 * Route matching is exact per screen (not a blanket `startsWith` on the
 * session prefix) so a route can only ever fall into one bucket.
 */
export type HomeEscapeConfirmKind = "active_workout" | "unsaved_summary" | null;

function isSessionOverviewRoute(pathname: string): boolean {
  return /^\/workouts\/session\/[^/]+\/?$/.test(pathname);
}

function isSessionExerciseRoute(pathname: string): boolean {
  return /^\/workouts\/session\/[^/]+\/exercise\/[^/]+\/?$/.test(pathname);
}

function isSessionSummaryRoute(pathname: string): boolean {
  return /^\/workouts\/session\/[^/]+\/summary\/?$/.test(pathname);
}

export function homeEscapeConfirmKind(pathname: string): HomeEscapeConfirmKind {
  if (isSessionSummaryRoute(pathname)) return "unsaved_summary";
  if (isSessionOverviewRoute(pathname) || isSessionExerciseRoute(pathname)) return "active_workout";
  return null;
}
