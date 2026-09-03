/**
 * Run with: node --test src/lib/motion-video-playback.test.ts
 *
 * Pure-logic regression for VIORA-MOTION-VIDEO-THREE-CYCLE-AUTOPLAY-001: the
 * three-cycle decision and the media-readiness gate, which together determine
 * how many times the `<video>` restarts and when the first autoplay may fire.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isMediaReady,
  MEDIA_READY_STATE,
  MOTION_VIDEO_CYCLE_TARGET,
  resolveCycleEnd,
} from "./motion-video-playback.ts";

test("a run is exactly three cycles", () => {
  assert.equal(MOTION_VIDEO_CYCLE_TARGET, 3);
});

test("resolveCycleEnd: restart after cycles 1 and 2, stop after cycle 3, never a 4th", () => {
  assert.equal(resolveCycleEnd(1), "restart");
  assert.equal(resolveCycleEnd(2), "restart");
  assert.equal(resolveCycleEnd(3), "complete");
  // Defensive: even if a stray `ended` slips through, it never restarts.
  assert.equal(resolveCycleEnd(4), "complete");
  assert.equal(resolveCycleEnd(99), "complete");
});

test("exactly three restarts-then-stop when folded over successive ended events", () => {
  let cycles = 0;
  const restarts: number[] = [];
  // Simulate: play -> ended -> (maybe restart) -> ended -> ...
  for (let endedEvent = 1; endedEvent <= 6; endedEvent += 1) {
    cycles += 1;
    if (resolveCycleEnd(cycles) === "restart") restarts.push(cycles);
  }
  assert.deepEqual(restarts, [1, 2], "restarts only after cycle 1 and cycle 2");
  assert.equal(resolveCycleEnd(3), "complete", "cycle 3 is the last");
});

test("isMediaReady mirrors HAVE_FUTURE_DATA (readyState >= 3)", () => {
  assert.equal(MEDIA_READY_STATE, 3);
  assert.equal(isMediaReady(0), false); // HAVE_NOTHING
  assert.equal(isMediaReady(1), false); // HAVE_METADATA
  assert.equal(isMediaReady(2), false); // HAVE_CURRENT_DATA
  assert.equal(isMediaReady(3), true); // HAVE_FUTURE_DATA
  assert.equal(isMediaReady(4), true); // HAVE_ENOUGH_DATA
});
