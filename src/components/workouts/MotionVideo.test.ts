/**
 * Run with: node --test src/components/workouts/MotionVideo.test.ts
 *
 * Source-level regression for VIORA-MOTION-VIDEO-PLAYBACK-ACCESSIBILITY-001.
 *
 * Same rationale as ExerciseMediaView.thumbnail.test.ts: there is no React
 * render harness in this repo and `node --test` cannot load `.tsx`, so the
 * invariants the sprint asks for are proven against MotionVideo's source plus
 * the JSX-free label module, which together fully determine the rendered
 * markup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MOTION_VIDEO_PAUSE_LABEL,
  MOTION_VIDEO_PAUSED_STATUS,
  MOTION_VIDEO_PLAY_LABEL,
  MOTION_VIDEO_PLAYING_STATUS,
} from "./motion-video-labels.ts";

const source = readFileSync(fileURLToPath(new URL("./MotionVideo.tsx", import.meta.url)), "utf8");

test("exactly one <video> element - no duplicate playback loop", () => {
  assert.equal((source.match(/^\s*<video\b/gm) ?? []).length, 1);
});

test("hydration-safe autoplay gate: never on the server / during hydration, never for Reduced Motion", () => {
  // Autoplay is allowed only once hydrated AND the user does not prefer
  // reduced motion - so the SSR/hydration render carries no autoPlay at all.
  assert.match(source, /const autoplayAllowed = hydrated && !prefersReducedMotion;/);
  assert.match(source, /autoPlay=\{autoplayAllowed\}/);
  assert.match(source, /useIsHydrated\(\)/);

  // The old, hydration-unsafe forms must be gone.
  assert.doesNotMatch(source, /autoPlay=\{!prefersReducedMotion\}/);
  assert.doesNotMatch(source, /autoPlay=\{true\}/);
  assert.doesNotMatch(
    source,
    /^\s*autoPlay\s*$/m,
    "autoplay must not be an unconditional attribute",
  );

  // Fail-safe initial state: paused until the real preference resolves.
  assert.match(source, /useState\(false\)/);
  assert.doesNotMatch(source, /useState\(!prefersReducedMotion\)/);

  // Normal playback attributes preserved (muted, loop, playsInline).
  for (const attr of [/^\s*loop\s*$/m, /^\s*muted\s*$/m, /^\s*playsInline\s*$/m]) {
    assert.match(source, attr);
  }
});

test("post-hydration playback transitions", () => {
  // Normal user: starts exactly once, only after hydration.
  assert.match(source, /const didAutostartRef = useRef\(false\);/);
  assert.match(source, /if \(!hydrated \|\| didAutostartRef\.current\) return;/);
  assert.match(source, /if \(!prefersReducedMotion\) \{\s*void videoRef\.current\?\.play\(\)/);

  // Reduced Motion turning ON pauses; the effect body has no play() call, so
  // turning it OFF cannot auto-resume.
  assert.match(
    source,
    /\}, \[prefersReducedMotion\]\);/,
    "a dedicated effect reacts to the reduced-motion preference",
  );
  assert.match(
    source,
    /if \(prefersReducedMotion\) videoRef\.current\?\.pause\(\);\s*\n\s*\}, \[prefersReducedMotion\]\);/,
  );
});

test("visible, accessible Play/Pause control that works with keyboard and touch", () => {
  // A native <button> - keyboard (Enter/Space) and touch both work for free.
  assert.match(source, /<button\s+type="button"/);
  assert.match(source, /onClick=\{toggle\}/);

  // Exact Hebrew accessible labels, swapped by playback state.
  assert.equal(MOTION_VIDEO_PLAY_LABEL, "הפעל סרטון");
  assert.equal(MOTION_VIDEO_PAUSE_LABEL, "השהה סרטון");
  assert.match(
    source,
    /aria-label=\{isPlaying \? MOTION_VIDEO_PAUSE_LABEL : MOTION_VIDEO_PLAY_LABEL\}/,
  );
});

test("playback state is conveyed without relying on colour alone", () => {
  // Distinct icon shapes (Play triangle vs Pause bars)...
  assert.match(source, /import \{ Pause, Play \} from "lucide-react"/);
  assert.match(source, /isPlaying \? \(\s*<Pause/);
  // ...a text label on the control...
  assert.match(
    source,
    /<span>\{isPlaying \? MOTION_VIDEO_PAUSE_SHORT : MOTION_VIDEO_PLAY_SHORT\}<\/span>/,
  );
  // ...a pressed state...
  assert.match(source, /aria-pressed=\{isPlaying\}/);
  // ...and an aria-live status region for screen readers.
  assert.match(source, /aria-live="polite"/);
  assert.equal(MOTION_VIDEO_PLAYING_STATUS, "הסרטון פועל");
  assert.equal(MOTION_VIDEO_PAUSED_STATUS, "הסרטון מושהה");
});

test("lifecycle: paused on unmount; single element keyed by media identity", () => {
  // Cleanup on unmount pauses the element (leaving the exercise view).
  assert.match(source, /return \(\) => \{\s*video\?\.pause\(\);\s*\};/);
  // Keyed by the Storage path so a genuinely different item resets state,
  // but a re-signed URL for the same item does not remount.
  assert.match(source, /key=\{mediaKey\}/);
});

test("signed-URL retry/error fallback stays intact - onError is forwarded verbatim", () => {
  assert.match(source, /onError=\{onError\}/);
  assert.match(source, /onError: React\.ReactEventHandler<HTMLVideoElement>/);
});
