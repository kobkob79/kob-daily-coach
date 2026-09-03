/**
 * Run with: node --test src/components/workouts/MotionVideo.test.ts
 *
 * Source-level regression for the Motion Video surface markup. There is no
 * React render harness in this repo and `node --test` cannot load `.tsx`, so
 * these assertions cover the static JSX only. Playback behaviour and media-
 * element listener lifetime are proven executably in
 * `src/lib/motion-video-playback-controller.test.ts`; the numeric cycle policy
 * in `src/lib/motion-video-playback.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MOTION_VIDEO_COMPLETE_STATUS,
  MOTION_VIDEO_PAUSE_LABEL,
  MOTION_VIDEO_PAUSED_STATUS,
  MOTION_VIDEO_PLAY_LABEL,
  MOTION_VIDEO_PLAYING_STATUS,
  MOTION_VIDEO_REPLAY_LABEL,
} from "./motion-video-labels.ts";

const source = readFileSync(fileURLToPath(new URL("./MotionVideo.tsx", import.meta.url)), "utf8");

test("exactly one <video> element - no duplicate playback loop", () => {
  assert.equal((source.match(/^\s*<video\b/gm) ?? []).length, 1);
});

test("the native infinite loop is gone; playback is delegated to the controller", () => {
  assert.doesNotMatch(source, /^\s*loop\s*$/m, "no native <video loop>");
  assert.doesNotMatch(source, /\bloop=\{/);
  assert.match(source, /useMotionVideoPlayback\(\{/);
  // No autoplay attribute either - the controller drives play() itself.
  assert.doesNotMatch(source, /autoPlay/);
});

test("normal playback attributes preserved: muted, playsInline, readiness-hinted preload", () => {
  assert.match(source, /^\s*muted\s*$/m);
  assert.match(source, /^\s*playsInline\s*$/m);
  assert.match(source, /preload=\{autoplayAllowed \? "auto" : "metadata"\}/);
  assert.match(source, /const autoplayAllowed = hydrated && !prefersReducedMotion;/);
});

test("hydration-safe: no autoplay on the server / during hydration, none for Reduced Motion", () => {
  assert.match(source, /useIsHydrated\(\)/);
  assert.match(source, /usePrefersReducedMotion\(\)/);
  assert.match(source, /useMotionVideoPlayback\(\{ hydrated, prefersReducedMotion \}\)/);
});

test("visible control supports pause, resume AND replay, keyboard + touch", () => {
  // Native <button> - keyboard (Enter/Space) and touch both work for free.
  assert.match(source, /<button\s+type="button"/);
  assert.match(source, /onClick=\{toggle\}/);
  // Tapping the video surface itself is wired too.
  assert.match(source, /onClick=\{onSurfaceActivate\}/);

  // Replay label after a completed playback session (five-cycle allowance spent).
  assert.equal(MOTION_VIDEO_REPLAY_LABEL, "הפעל שוב");
  assert.match(
    source,
    /runComplete\s*\n?\s*\? MOTION_VIDEO_REPLAY_LABEL\s*\n?\s*: isPlaying\s*\n?\s*\? MOTION_VIDEO_PAUSE_LABEL\s*\n?\s*: MOTION_VIDEO_PLAY_LABEL/,
  );
  assert.match(source, /aria-label=\{controlLabel\}/);

  assert.equal(MOTION_VIDEO_PLAY_LABEL, "הפעל סרטון");
  assert.equal(MOTION_VIDEO_PAUSE_LABEL, "השהה סרטון");
});

test("playback state is conveyed without relying on colour alone", () => {
  // A distinct icon shape per state: replay ↺ / pause ❚❚ / play ▶.
  assert.match(source, /import \{ Pause, Play, RotateCcw \} from "lucide-react"/);
  assert.match(source, /runComplete \? \(\s*<RotateCcw/);
  assert.match(source, /\) : isPlaying \? \(\s*<Pause/);
  // A text label on the control...
  assert.match(source, /<span>\{controlShort\}<\/span>/);
  // ...a pressed state...
  assert.match(source, /aria-pressed=\{isPlaying\}/);
  // ...and an aria-live status region, including a distinct "finished" string.
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /\{statusText\}/);
  assert.equal(MOTION_VIDEO_PLAYING_STATUS, "הסרטון פועל");
  assert.equal(MOTION_VIDEO_PAUSED_STATUS, "הסרטון מושהה");
  assert.equal(MOTION_VIDEO_COMPLETE_STATUS, "הסרטון הסתיים");
});

test("the <video> is replaced on media change and bound by a callback ref", () => {
  // key={mediaKey} tears down / recreates the node; the callback ref then
  // fires null → newNode so the controller re-binds its listeners. Executable
  // proof of the listener migration lives in
  // motion-video-playback-controller.test.ts.
  assert.match(source, /<video\s*\n\s*key=\{mediaKey\}\s*\n\s*ref=\{setVideoElement\}/);
  assert.doesNotMatch(source, /ref=\{videoRef\}/);
  assert.doesNotMatch(source, /\buseRef\b/, "MotionVideo keeps no video ref object");
});

test("signed-URL fallback is preserved: onError forwarded verbatim to the <video>", () => {
  assert.match(source, /onError=\{onError\}/);
  assert.match(source, /onError: React\.ReactEventHandler<HTMLVideoElement>/);
});
