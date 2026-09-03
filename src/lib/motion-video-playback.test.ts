/**
 * Run with: node --test src/lib/motion-video-playback.test.ts
 *
 * Pure-logic regression for VIORA-MOTION-VIDEO-FIVE-CYCLE-ADDENDUM-001: the
 * five-cycle decision and the media-readiness gate, which together determine
 * how many times the `<video>` restarts and when the first autoplay may fire.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isMediaReady,
  MEDIA_READY_STATE,
  MOTION_VIDEO_MAX_CYCLES,
  resolveCycleEnd,
} from "./motion-video-playback.ts";

test("a playback session is capped at five completed cycles", () => {
  assert.equal(MOTION_VIDEO_MAX_CYCLES, 5);
});

test("resolveCycleEnd: restart after cycles 1-4, stop after cycle 5, never a 6th", () => {
  assert.equal(resolveCycleEnd(1), "restart");
  assert.equal(resolveCycleEnd(2), "restart");
  assert.equal(resolveCycleEnd(3), "restart");
  assert.equal(resolveCycleEnd(4), "restart");
  assert.equal(resolveCycleEnd(5), "complete");
  // Defensive: a duplicate/stale completion event never restarts.
  assert.equal(resolveCycleEnd(6), "complete");
  assert.equal(resolveCycleEnd(99), "complete");
});

test("exactly four restarts-then-stop when folded over successive completion events", () => {
  let cycles = 0;
  const restarts: number[] = [];
  // Simulate: play -> ended -> (maybe restart) -> ended -> ...
  for (let endedEvent = 1; endedEvent <= 8; endedEvent += 1) {
    if (cycles >= MOTION_VIDEO_MAX_CYCLES) break; // cap guard, mirrors the hook
    cycles += 1;
    if (resolveCycleEnd(cycles) === "restart") restarts.push(cycles);
  }
  assert.deepEqual(restarts, [1, 2, 3, 4], "restarts only after cycles 1-4");
  assert.equal(cycles, MOTION_VIDEO_MAX_CYCLES, "stops exactly at the cap");
  assert.equal(resolveCycleEnd(cycles), "complete", "cycle 5 is the last");
});

test("isMediaReady mirrors HAVE_FUTURE_DATA (readyState >= 3)", () => {
  assert.equal(MEDIA_READY_STATE, 3);
  assert.equal(isMediaReady(0), false); // HAVE_NOTHING
  assert.equal(isMediaReady(1), false); // HAVE_METADATA
  assert.equal(isMediaReady(2), false); // HAVE_CURRENT_DATA
  assert.equal(isMediaReady(3), true); // HAVE_FUTURE_DATA
  assert.equal(isMediaReady(4), true); // HAVE_ENOUGH_DATA
});
