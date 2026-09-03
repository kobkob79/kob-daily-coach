/**
 * Run with: node --test src/hooks/useMotionVideoPlayback.test.ts
 *
 * Source-level regression for the finite (five-cycle) autoplay controller
 * (VIORA-MOTION-VIDEO-FIVE-CYCLE-ADDENDUM-001). There is no React render
 * harness in this repo and `node --test` cannot load `.tsx`, so the controller
 * invariants are proven against the hook's source; the numeric decision itself
 * is covered by `src/lib/motion-video-playback.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./useMotionVideoPlayback.ts", import.meta.url)),
  "utf8",
);

test("cycles are counted from `ended` events only - never timers", () => {
  assert.match(source, /addEventListener\("ended", onEnded\)/);
  assert.match(source, /removeEventListener\("ended", onEnded\)/);
  assert.match(source, /cyclesRef\.current \+= 1;/);
  assert.match(source, /resolveCycleEnd\(cyclesRef\.current\)/);
  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame/);
});

test("the five-cycle cap is a single named constant, guarded against stale events", () => {
  // No inline "5" for the limit - only the shared constant.
  assert.match(source, /MOTION_VIDEO_MAX_CYCLES/);
  assert.doesNotMatch(source, /MOTION_VIDEO_CYCLE_TARGET/);
  // Duplicate / stale `ended` after the cap is ignored → never a sixth cycle.
  assert.match(source, /if \(cyclesRef\.current >= MOTION_VIDEO_MAX_CYCLES\) return;/);
  assert.match(source, /const done = cyclesRef\.current >= MOTION_VIDEO_MAX_CYCLES;/);
});

test("no native infinite loop is reintroduced here", () => {
  assert.doesNotMatch(source, /\.loop\s*=/);
  assert.doesNotMatch(source, /loop:\s*true/);
});

test("restart path seeks to 0 and calls play(); completion path stops", () => {
  // After cycles 1-4: rewind + play. After cycle 5: setRunComplete, return.
  assert.match(
    source,
    /if \(resolveCycleEnd\(cyclesRef\.current\) === "complete" \|\| reducedMotionRef\.current\) \{\s*setRunComplete\(done\);\s*return;\s*\}/,
  );
  assert.match(
    source,
    /video\.currentTime = 0;\s*\n\s*}\s*catch[\s\S]*?void video\.play\(\)\.catch/,
  );
});

test("visual state stays accurate when browser autoplay is rejected", () => {
  // isPlaying mirrors the real element via play/playing/pause listeners, so a
  // rejected play() (element stays paused) leaves the control showing "play".
  assert.match(source, /const sync = \(\) => setIsPlaying\(!video\.paused && !video\.ended\);/);
  assert.match(source, /video\.addEventListener\("play", sync\);/);
  assert.match(source, /video\.addEventListener\("playing", sync\);/);
  assert.match(source, /video\.addEventListener\("pause", sync\);/);
  // Every autoplay/replay/resume play() call swallows rejection so no unhandled
  // promise, and the pause event keeps state honest.
  assert.doesNotMatch(source, /await video\.play\(\)/);
});

test("automatic first run waits for hydration + media readiness", () => {
  assert.match(source, /if \(!hydrated \|\| autoStartRef\.current !== "idle"\) return;/);
  assert.match(
    source,
    /if \(isMediaReady\(video\.readyState\)\) attempt\(\);\s*\n\s*else onceReady\(attempt\);/,
  );
});

test("one early failed play() gets exactly one readiness-triggered retry", () => {
  // The first attempt's rejection handler is the retry; it flips to "retried"
  // and never runs again once "retried"/"done".
  assert.match(source, /void video\.play\(\)\.then\(settleDone, retryWhenReady\);/);
  assert.match(
    source,
    /if \(disposed \|\| autoStartRef\.current === "retried" \|\| autoStartRef\.current === "done"\) return;\s*\n\s*autoStartRef\.current = "retried";/,
  );
  assert.match(source, /onceReady\(\(\) => void video\.play\(\)\.then\(settleDone, settleDone\)\)/);
});

test('"autoplay done" is only set after a play() promise settles', () => {
  assert.match(
    source,
    /const settleDone = \(\) => \{\s*if \(!disposed\) autoStartRef\.current = "done";\s*\};/,
  );
  // "done" is never assigned right before a play() call (i.e. pre-emptively).
  assert.doesNotMatch(source, /autoStartRef\.current = "done";\s*\n\s*(void )?video\.play\(/);
});

test("cycle state resets on mediaKey change, but not on a signed-URL refresh", () => {
  // A dedicated effect keyed on mediaKey alone.
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*cyclesRef\.current = 0;\s*autoStartRef\.current = "idle";\s*setRunComplete\(false\);\s*setIsPlaying\(false\);\s*\}, \[mediaKey\]\);/,
  );
  // The hook never looks at the URL, so a refreshed `src` can't reset anything.
  assert.doesNotMatch(source, /\bsrc\b/);
});

test("Reduced Motion: no autoplay, pause on enable, no resume on disable", () => {
  // Enabling reduced motion pauses immediately.
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(prefersReducedMotion\) videoRef\.current\?\.pause\(\);\s*\}, \[prefersReducedMotion, videoRef\]\);/,
  );
  // Reduced Motion at first hydration consumes the automatic slot without
  // playing, so turning it off later cannot trigger a delayed autoplay.
  assert.match(
    source,
    /if \(prefersReducedMotion\) \{\s*autoStartRef\.current = "done";\s*return;\s*\}/,
  );
});

test("manual replay vs pause/resume: resume keeps the count", () => {
  // Replay (run complete) → full reset via startFreshRun.
  assert.match(
    source,
    /const startFreshRun = useCallback\(\(\) => \{[\s\S]*?cyclesRef\.current = 0;[\s\S]*?void video\.play\(\)/,
  );
  // Resume (run live, element paused) → bare play(), no cycle reset.
  assert.match(
    source,
    /if \(video\.paused\) \{\s*\n\s*\/\/ Resume[\s\S]*?void video\.play\(\)\.catch\(\(\) => \{\}\);\s*\n\s*\} else \{\s*\n\s*video\.pause\(\);/,
  );
  // The resume branch must not touch the counter.
  const toggleBody = source.slice(source.indexOf("const toggle = useCallback"));
  assert.doesNotMatch(
    toggleBody.slice(0, toggleBody.indexOf("}, [runComplete")),
    /cyclesRef\.current\s*=/,
    "toggle() must not reset the cycle count - only startFreshRun does",
  );
});

test("tapping the video surface replays after completion, else pause/resume", () => {
  assert.match(
    source,
    /const onSurfaceActivate = useCallback\(\(\) => \{\s*if \(runComplete\) startFreshRun\(\);\s*else toggle\(\);\s*\}, \[runComplete, startFreshRun, toggle\]\);/,
  );
});

test("one <video>, paused on unmount", () => {
  // The hook attaches to a single passed-in ref; the unmount cleanup pauses it.
  assert.match(source, /videoRef: React\.RefObject<HTMLVideoElement \| null>/);
  assert.match(source, /return \(\) => \{\s*video\?\.pause\(\);\s*\};/);
});
