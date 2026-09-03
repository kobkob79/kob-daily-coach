/**
 * Run with: node --test src/hooks/useMotionVideoPlayback.test.ts
 *
 * `useMotionVideoPlayback` is a thin React binding around
 * `MotionVideoPlaybackController`. The RUNTIME behaviour of playback and
 * listener lifetime is proven executably in
 * `src/lib/motion-video-playback-controller.test.ts` — the assertions here are
 * only structural regression guards for the wiring the review asked for
 * (callback ref, no `videoRef`, controller delegation, dispose on unmount).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./useMotionVideoPlayback.ts", import.meta.url)),
  "utf8",
);

test("no stable media-element RefObject and no `.current` effect dependency", () => {
  assert.doesNotMatch(source, /\bvideoRef\b/, "the hook must not use a videoRef object");
  assert.doesNotMatch(source, /useRef<HTMLVideoElement/, "no HTMLVideoElement ref object");
  assert.doesNotMatch(
    source,
    /\[[^\]]*\.current[^\]]*\]/,
    "no `.current` value appears in a dependency array",
  );
});

test("the media element is bound through a stable callback ref", () => {
  assert.match(source, /const setVideoElement = useCallback\(/);
  assert.match(
    source,
    /\(element: HTMLVideoElement \| null\) => \{\s*controller\.setElement\(element\);\s*\}/,
  );
  assert.match(
    source,
    /\},\s*\n\s*\[controller\],\s*\n\s*\);/,
    "stable ref: depends only on controller",
  );
  assert.match(source, /setVideoElement,\s*\n\s*\};/, "setVideoElement is returned to MotionVideo");
  // The hook signature does not take mediaKey - MotionVideo keys the <video>.
  assert.doesNotMatch(source, /mediaKey,?\s*\n\s*\}: MotionVideoPlaybackOptions/);
});

test("all behaviour is delegated to MotionVideoPlaybackController", () => {
  assert.match(source, /new MotionVideoPlaybackController\(\{/);
  assert.match(source, /controller\.setReducedMotion\(prefersReducedMotion\);/);
  assert.match(source, /controller\.setHydrated\(hydrated\);/);
  assert.match(source, /controller\.toggle\(\)/);
  assert.match(source, /controller\.onSurfaceActivate\(\)/);
  // Reduced Motion is pushed before hydration so the autoplay decision is correct.
  assert.match(
    source,
    /controller\.setReducedMotion\(prefersReducedMotion\);\s*\n\s*controller\.setHydrated\(hydrated\);/,
  );
});

test("unmount disposes the controller (pause + detach every listener)", () => {
  assert.match(source, /return \(\) => controller\.dispose\(\);/);
});
