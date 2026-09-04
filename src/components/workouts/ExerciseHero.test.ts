/**
 * Run with: node --test src/components/workouts/ExerciseHero.test.ts
 *
 * Source-level regression: the active-workout-session hero used a raw native
 * `<video autoPlay loop muted>` with no visible control, bypassing the
 * accessible, five-cycle-capped `MotionVideo` player used everywhere else
 * (Exercise Library card, Exercise Details Sheet). That meant a video here
 * played forever with no way to pause, stop, or replay it, and ignored
 * Reduced Motion entirely. This locks in the migration to `MotionVideo`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./ExerciseHero.tsx", import.meta.url)), "utf8");

test("the video branch renders MotionVideo, not a raw <video>", () => {
  assert.match(source, /import \{ MotionVideo \} from "\.\/MotionVideo";/);
  assert.match(source, /<MotionVideo\b/);
  assert.doesNotMatch(source, /<video\b/, "no raw <video> element left in this file");
});

test("no native autoPlay/loop left for this surface - playback is delegated to MotionVideo", () => {
  assert.doesNotMatch(source, /\bautoPlay\b/);
  assert.doesNotMatch(source, /^\s*loop\s*$/m);
});

test("the 'מדריך מלא' button sits opposite MotionVideo's own control, so they never collide", () => {
  assert.match(
    source,
    /onClick=\{\(\) => setGuideOpen\(true\)\}\s*\n\s*className="absolute bottom-3 right-3/,
  );
});
