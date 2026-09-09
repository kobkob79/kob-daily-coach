/**
 * Run with: node --test src/lib/home-escape.test.ts
 *
 * VIORA NAV-001 — pure decision logic for the shared HomeEscapeButton.
 * Covers: not shown on home, shown on a deep screen with no direct nav,
 * never shown twice on a screen that already has the bottom-nav home tab,
 * and — per the Codex re-review — that the leave-confirmation is route-aware
 * rather than a blanket "every /workouts/session/* sub-route" check:
 * overview/exercise (active edits) vs. summary (unsaved feedback fields)
 * vs. brief/debrief/debrief-export (no local unsaved state, no prompt).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_ROUTE,
  hasVisibleBottomNavHome,
  homeEscapeConfirmKind,
  isWorkoutSessionRoute,
  shouldShowHomeEscapeButton,
} from "./home-escape.ts";

test("HOME_ROUTE is the dashboard, not derived from history", () => {
  assert.equal(HOME_ROUTE, "/dashboard");
});

test("isWorkoutSessionRoute matches every screen in the active-workout flow", () => {
  const activeWorkoutPaths = [
    "/workouts/session/abc-123",
    "/workouts/session/abc-123/",
    "/workouts/session/abc-123/exercise/ex-1",
    "/workouts/session/abc-123/summary",
    "/workouts/session/abc-123/brief",
    "/workouts/session/abc-123/debrief",
    "/workouts/session/abc-123/debrief/export",
  ];
  for (const p of activeWorkoutPaths) {
    assert.equal(isWorkoutSessionRoute(p), true, `expected ${p} to be a workout-session route`);
  }
});

test("isWorkoutSessionRoute does not match lookalike routes", () => {
  const notActiveWorkout = [
    "/workouts",
    "/workouts/history",
    "/workouts/history/abc-123",
    "/workout-session/abc-123",
    "/workouts/program",
    "/workout-templates",
  ];
  for (const p of notActiveWorkout) {
    assert.equal(
      isWorkoutSessionRoute(p),
      false,
      `expected ${p} to NOT be a workout-session route`,
    );
  }
});

test("shouldShowHomeEscapeButton: never shown on the home route itself", () => {
  assert.equal(shouldShowHomeEscapeButton("/dashboard"), false);
});

test("shouldShowHomeEscapeButton: shown on every workout-session screen (button visibility stays broad)", () => {
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/exercise/ex-1"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/summary"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/brief"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/debrief"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/debrief/export"), true);
});

test("shouldShowHomeEscapeButton: not shown where the bottom nav already has a home tab (no duplicate)", () => {
  const screensWithBottomNav = [
    "/workouts",
    "/workouts/history/abc-123",
    "/workout-templates",
    "/workouts/program",
    "/nutrition",
    "/meals",
    "/community",
    "/messages/some-user",
    "/u/some-user",
    "/coach",
    "/coach/some-advisor",
    "/profile",
    "/health",
    "/progress",
  ];
  for (const p of screensWithBottomNav) {
    assert.equal(
      shouldShowHomeEscapeButton(p),
      false,
      `expected no HomeEscapeButton on ${p} — bottom nav already provides home`,
    );
  }
});

test("hasVisibleBottomNavHome mirrors the inverse of the active-workout flow", () => {
  assert.equal(hasVisibleBottomNavHome("/dashboard"), true);
  assert.equal(hasVisibleBottomNavHome("/workouts/session/abc-123"), false);
});

test("homeEscapeConfirmKind: session overview is active_workout", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123"), "active_workout");
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/"), "active_workout");
});

test("homeEscapeConfirmKind: per-exercise focus screen is active_workout", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/exercise/ex-1"), "active_workout");
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/exercise/ex-1/"), "active_workout");
});

test("homeEscapeConfirmKind: summary is unsaved_summary (feedback only persists on 'שמור אימון')", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/summary"), "unsaved_summary");
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/summary/"), "unsaved_summary");
});

test("homeEscapeConfirmKind: brief has no locally-entered unsaved state, no prompt", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/brief"), null);
});

test("homeEscapeConfirmKind: debrief (read-only AI output) has no prompt", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/debrief"), null);
});

test("homeEscapeConfirmKind: debrief/export (read-only, post-finalize) has no prompt", () => {
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/debrief/export"), null);
});

test("homeEscapeConfirmKind: a route that merely starts with the session prefix is not misclassified", () => {
  // Regression guard for the original bug: shouldConfirmBeforeHomeEscape()
  // used to be `isWorkoutSessionRoute(pathname)`, i.e. a blanket
  // startsWith("/workouts/session/") — which wrongly flagged brief/debrief
  // too. Exact per-screen matching must not accidentally widen back out to
  // a prefix match for lookalike/extra-segment paths.
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/exercise"), null);
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/summary/export"), null);
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/summary-notes"), null);
  assert.equal(homeEscapeConfirmKind("/workouts/session/abc-123/exercise/ex-1/notes"), null);
});

test("homeEscapeConfirmKind: routes outside the active-workout flow never prompt", () => {
  assert.equal(homeEscapeConfirmKind("/workouts"), null);
  assert.equal(homeEscapeConfirmKind("/workouts/history/abc-123"), null);
  assert.equal(homeEscapeConfirmKind("/coach/some-advisor"), null);
  assert.equal(homeEscapeConfirmKind("/dashboard"), null);
});
