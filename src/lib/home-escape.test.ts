/**
 * Run with: node --test src/lib/home-escape.test.ts
 *
 * VIORA NAV-001 — pure decision logic for the shared HomeEscapeButton.
 * Covers: not shown on home, shown on a deep screen with no direct nav,
 * never shown twice on a screen that already has the bottom-nav home tab,
 * and the active-workout confirm-before-leave gate.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_ROUTE,
  hasVisibleBottomNavHome,
  isWorkoutSessionRoute,
  shouldConfirmBeforeHomeEscape,
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

test("shouldShowHomeEscapeButton: shown on a deep screen with no direct nav", () => {
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/exercise/ex-1"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/summary"), true);
  assert.equal(shouldShowHomeEscapeButton("/workouts/session/abc-123/debrief"), true);
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

test("shouldConfirmBeforeHomeEscape: only the active-workout flow requires a leave-confirmation", () => {
  assert.equal(shouldConfirmBeforeHomeEscape("/workouts/session/abc-123"), true);
  assert.equal(shouldConfirmBeforeHomeEscape("/workouts/session/abc-123/exercise/ex-1"), true);
  assert.equal(shouldConfirmBeforeHomeEscape("/workouts"), false);
  assert.equal(shouldConfirmBeforeHomeEscape("/coach/some-advisor"), false);
  assert.equal(shouldConfirmBeforeHomeEscape("/dashboard"), false);
});
