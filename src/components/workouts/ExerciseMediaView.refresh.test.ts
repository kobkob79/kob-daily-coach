/**
 * Run with: node --test src/components/workouts/ExerciseMediaView.refresh.test.ts
 *
 * Source-level regression for VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001,
 * Part 3 ("a replacement must appear without a hard refresh") and Part 5
 * scenario 5.
 *
 * Two independent bugs could each cause a freshly assigned demo video to
 * stay invisible after a successful replace, even once the query refetches
 * with the new item:
 *
 *  1. `failed`/`retriedRef` (ExerciseMediaView) and `failed`
 *     (ExerciseHero) latch permanently once a *previous* media item's
 *     `<video>`/`<img>` fired `onError` - a new, perfectly good item
 *     resolved afterward would still render the placeholder because the
 *     flag was never cleared.
 *  2. The `<video>`/`<img>` React `key` was the Storage *path* alone. A
 *     same-extension replacement (e.g. demo.mp4 → demo.mp4) keeps the same
 *     path, so the element would never remount - `<video src>` still
 *     updates in that case, but `MotionVideo`'s internal 5-cycle-cap/replay
 *     state would carry over from the old file instead of resetting.
 *
 * Both surfaces must key off item identity (path + updatedAt) instead, so
 * an in-place replacement is treated exactly like resolving a new item.
 * Source-level because this repo has no React rendering test harness - see
 * ExerciseHero.test.ts / ExerciseMediaView.thumbnail.test.ts for the same
 * convention.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mediaViewSource = readFileSync(
  fileURLToPath(new URL("./ExerciseMediaView.tsx", import.meta.url)),
  "utf8",
);
const heroSource = readFileSync(
  fileURLToPath(new URL("./ExerciseHero.tsx", import.meta.url)),
  "utf8",
);

test("ExerciseMediaView: the resolved item's identity (path + updatedAt) - not the path alone - drives both the remount key and the failed/retry reset", () => {
  assert.match(
    mediaViewSource,
    /const resolvedIdentity = resolved[\s\S]{0,20}\? `\$\{resolved\.item\.path\}::\$\{resolved\.item\.updatedAt \?\? ""\}`[\s\S]{0,10}: null;/,
  );
  assert.match(
    mediaViewSource,
    /useEffect\(\(\) => \{\s*\n\s*retriedRef\.current = false;\s*\n\s*setFailed\(false\);\s*\n\s*\}, \[resolvedIdentity\]\);/,
    "failed/retriedRef must reset whenever the resolved item's identity changes",
  );
  assert.match(mediaViewSource, /key=\{resolvedIdentity\}/);
  assert.doesNotMatch(
    mediaViewSource,
    /key=\{usableHero\.item\.path\}/,
    "the path alone is not enough to key remounts - a same-path replacement must also force one",
  );
});

test("ExerciseHero: the resolved item's identity drives both the remount key and the failed-flag reset", () => {
  assert.match(
    heroSource,
    /const heroIdentity = hero \? `\$\{hero\.item\.path\}::\$\{hero\.item\.updatedAt \?\? ""\}` : null;/,
  );
  assert.match(
    heroSource,
    /useEffect\(\(\) => \{\s*\n\s*setFailed\(false\);\s*\n\s*\}, \[heroIdentity\]\);/,
  );
  assert.match(heroSource, /key=\{heroIdentity\}/);
  assert.doesNotMatch(heroSource, /key=\{usableHero\.item\.path\}/);
});

test("ExerciseHero resolves the active_workout policy through the shared resolver, not the generic (any-file, video-first) hero pick", () => {
  assert.match(
    heroSource,
    /const hero = resolve\("active_workout"\);/,
    'ExerciseHero must call resolve("active_workout") - the same resolver ExerciseDetailsSheet uses for ' +
      '"exercise_details" - rather than a private/parallel media-picking implementation',
  );
  assert.doesNotMatch(
    heroSource,
    /pickHeroMedia/,
    "ExerciseHero must not reach for the generic hero picker directly",
  );
});
