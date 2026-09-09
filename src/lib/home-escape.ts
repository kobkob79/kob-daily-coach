/**
 * VIORA NAV-001 — Global Home Escape.
 *
 * Single source of truth for "does this screen already give the user a
 * one-tap, history-independent path to the real home route, or does it need
 * the shared HomeEscapeButton?" Kept as pure functions (no React, no router
 * instance) so the decision logic is unit-testable with `node --test` —
 * this repo has no React render harness (see
 * src/hooks/usePrefersReducedMotion.test.ts).
 */

/** The one true home route. Never derived from history. */
export const HOME_ROUTE = "/dashboard";

/**
 * The in-progress workout flow (overview, per-exercise focus, brief,
 * summary, coach debrief + export) is the only place AppShell hides its
 * bottom nav (see hideBottomNav in AppShell.tsx) — so it's the only place
 * that loses the built-in one-tap-home tab.
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
 * Active-workout screens must confirm before leaving to home (data itself
 * is never at risk — every field auto-saves on blur/mutation — but the
 * product requirement is a clear confirmation regardless, since an
 * in-progress set is easy to leave mid-way by accident).
 */
export function shouldConfirmBeforeHomeEscape(pathname: string): boolean {
  return isWorkoutSessionRoute(pathname);
}
