/**
 * Run with: node --test src/lib/exercise-media.test.ts
 *
 * Covers VIORA-EXERCISE-THUMBNAIL-STATIC-MEDIA-HOTFIX-001: the Exercise
 * Library card thumbnail must always resolve to a static image (or
 * nothing), never a Motion Video, even when a video is the only media
 * present or is explicitly assigned to a role.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  pickHeroMedia,
  resolveExerciseMedia,
  resolveExerciseThumbnailStill,
} from "./exercise-media.ts";
import type { MediaItem } from "@/services/media.service";

function mediaItem(overrides: Partial<MediaItem> & Pick<MediaItem, "name">): MediaItem {
  return {
    path: `exercises/ex-1/${overrides.name}`,
    folder: "",
    kind: "image",
    mimeType: null,
    size: null,
    updatedAt: null,
    url: `https://example.com/${overrides.name}`,
    ...overrides,
  };
}

const thumbnailImage = mediaItem({ name: "thumbnail.jpg", kind: "image" });
const thumbnailVideo = mediaItem({ name: "thumbnail.mp4", kind: "video" });
const mainImage = mediaItem({ name: "main.jpg", kind: "image" });
const mainVideo = mediaItem({ name: "main.mp4", kind: "video" });
const genericMotionVideo = mediaItem({ name: "motion.mp4", kind: "video" });
const heroNamedImage = mediaItem({ name: "hero-cover.jpg", kind: "image" });
const animatedGif = mediaItem({ name: "thumbnail.gif", kind: "image" });

test("resolveExerciseThumbnailStill selects the explicit thumbnail image", () => {
  const resolved = resolveExerciseThumbnailStill([thumbnailImage, mainImage]);
  assert.equal(resolved?.item.name, "thumbnail.jpg");
  assert.equal(resolved?.role, "image");
});

test("resolveExerciseThumbnailStill falls back to the main image when no thumbnail exists", () => {
  const resolved = resolveExerciseThumbnailStill([mainImage, genericMotionVideo]);
  assert.equal(resolved?.item.name, "main.jpg");
  assert.equal(resolved?.role, "image");
});

test("resolveExerciseThumbnailStill rejects an explicit thumbnail video", () => {
  const resolved = resolveExerciseThumbnailStill([thumbnailVideo, mainImage]);
  assert.equal(resolved?.item.name, "main.jpg");
});

test("resolveExerciseThumbnailStill rejects an explicit main video for the thumbnail surface", () => {
  const resolved = resolveExerciseThumbnailStill([thumbnailVideo, mainVideo]);
  assert.equal(resolved, null);
});

test("resolveExerciseThumbnailStill rejects a thumbnail-named animated GIF", () => {
  const resolved = resolveExerciseThumbnailStill([animatedGif, mainImage]);
  assert.equal(resolved?.item.name, "main.jpg");
});

test("resolveExerciseThumbnailStill never returns a generic Motion Video as a thumbnail fallback", () => {
  const resolved = resolveExerciseThumbnailStill([genericMotionVideo]);
  assert.equal(resolved, null);
});

test("resolveExerciseThumbnailStill does not silently select an unassigned hero-named image", () => {
  // No explicit thumbnail.* or main.* file exists - only a generically
  // hero-named still, which pickHeroMedia() would happily pick. The static
  // policy requires an *explicit* thumbnail/main role, so this must stay null
  // rather than reaching into the generic hero pool.
  const resolved = resolveExerciseThumbnailStill([heroNamedImage, genericMotionVideo]);
  assert.equal(resolved, null);
});

test("resolveExerciseThumbnailStill returns null when no static thumbnail/main image exists", () => {
  assert.equal(resolveExerciseThumbnailStill([]), null);
  assert.equal(resolveExerciseThumbnailStill([genericMotionVideo]), null);
});

test('resolveExerciseMedia(items, "thumbnail") delegates to the static resolver and never returns video', () => {
  const withOnlyVideo = resolveExerciseMedia([genericMotionVideo, heroNamedImage], "thumbnail");
  assert.equal(withOnlyVideo, null);

  const withThumbnail = resolveExerciseMedia([thumbnailImage, genericMotionVideo], "thumbnail");
  assert.equal(withThumbnail?.item.name, "thumbnail.jpg");
  assert.equal(withThumbnail?.role, "image");
});

test("resolveExerciseMedia keeps the generic video-first hero priority for the hero slot", () => {
  const resolved = resolveExerciseMedia([mainImage, genericMotionVideo], "hero");
  assert.equal(resolved?.role, "video");
  assert.equal(resolved?.item.name, "motion.mp4");
});

test("resolveExerciseMedia keeps existing behavior for the main slot (falls through to hero)", () => {
  const resolved = resolveExerciseMedia([genericMotionVideo], "main");
  assert.equal(resolved?.role, "video");
});

test("resolveExerciseMedia keeps existing behavior for the guide slot (falls through to main, then hero)", () => {
  const resolvedWithMain = resolveExerciseMedia([mainImage, genericMotionVideo], "guide");
  assert.equal(resolvedWithMain?.item.name, "main.jpg");

  const resolvedWithoutMain = resolveExerciseMedia([genericMotionVideo], "guide");
  assert.equal(resolvedWithoutMain?.role, "video");
  assert.equal(resolvedWithoutMain?.item.name, "motion.mp4");
});

test("resolveExerciseMedia can still resolve an explicit demo Motion Video (exercise details surfaces are unaffected)", () => {
  const demoVideo = mediaItem({ name: "demo.mp4", kind: "video" });
  const resolved = resolveExerciseMedia([demoVideo], "demo");
  assert.equal(resolved?.item.name, "demo.mp4");
  assert.equal(resolved?.role, "video");
});

test("resolveExerciseMedia(main) still resolves an explicit main Motion Video for exercise details", () => {
  const resolved = resolveExerciseMedia([mainVideo], "main");
  assert.equal(resolved?.item.name, "main.mp4");
  assert.equal(resolved?.role, "video");
});

test("pickHeroMedia (generic hero/session surfaces) is unchanged and still prioritizes video", () => {
  const resolved = pickHeroMedia([mainImage, genericMotionVideo]);
  assert.equal(resolved?.role, "video");
});

// ============================================================================
// VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001
//
// active_workout / exercise_details must always agree with each other (demo
// → main → thumbnail, canonical roles only) and library_card (the
// `thumbnail` slot) must independently agree with itself - all through this
// one resolver. See the ticket's "Part 5 — בדיקות חובה" for the numbered
// scenarios these tests cover.
// ============================================================================

const demoVideo = mediaItem({ name: "demo.mp4", kind: "video" });

test("scenario 1: demo + main + thumbnail all assigned - workout and details get demo, library gets thumbnail", () => {
  const items = [demoVideo, mainImage, thumbnailImage];

  const workout = resolveExerciseMedia(items, "active_workout");
  assert.equal(workout?.item.name, "demo.mp4");
  assert.equal(workout?.role, "video");

  const details = resolveExerciseMedia(items, "exercise_details");
  assert.equal(details?.item.name, "demo.mp4");
  assert.equal(details?.role, "video");

  const library = resolveExerciseMedia(items, "thumbnail");
  assert.equal(library?.item.name, "thumbnail.jpg");
  assert.equal(library?.role, "image");
});

test("scenario 2: main assigned, no demo - workout and details fall back to main, library still resolves", () => {
  const items = [mainImage, thumbnailImage];

  const workout = resolveExerciseMedia(items, "active_workout");
  assert.equal(workout?.item.name, "main.jpg");

  const details = resolveExerciseMedia(items, "exercise_details");
  assert.equal(details?.item.name, "main.jpg");

  const library = resolveExerciseMedia(items, "thumbnail");
  assert.equal(library?.item.name, "thumbnail.jpg");
});

test("scenario 2b: main assigned, no demo, no thumbnail - library falls back to main too", () => {
  const items = [mainImage];
  const library = resolveExerciseMedia(items, "thumbnail");
  assert.equal(library?.item.name, "main.jpg");
});

test("scenario 3: no canonical media anywhere - every surface resolves to null so the caller falls back to exercises.image_path", () => {
  assert.equal(resolveExerciseMedia([], "active_workout"), null);
  assert.equal(resolveExerciseMedia([], "exercise_details"), null);
  assert.equal(resolveExerciseMedia([], "thumbnail"), null);
});

test("scenario 4: active_workout/exercise_details never fall through to the generic (any-file) hero pick, even when a non-canonical video is present", () => {
  // Simulates a leaked/incidental file (e.g. an unassigned or V2 draft video
  // that should never have reached this resolver) sitting alongside real
  // canonical media - it must never win over the canonical policy, and must
  // never be picked at all once canonical roles are exhausted.
  const strayVideo = mediaItem({ name: "motion.mp4", kind: "video" });

  const workoutWithMain = resolveExerciseMedia([mainImage, strayVideo], "active_workout");
  assert.equal(
    workoutWithMain?.item.name,
    "main.jpg",
    "canonical main must win over a stray video",
  );

  const workoutWithNothingCanonical = resolveExerciseMedia([strayVideo], "active_workout");
  assert.equal(
    workoutWithNothingCanonical,
    null,
    "a stray video must never surface on the active-workout surface",
  );

  const detailsWithNothingCanonical = resolveExerciseMedia([strayVideo], "exercise_details");
  assert.equal(
    detailsWithNothingCanonical,
    null,
    "a stray video must never surface on the exercise-details surface",
  );
});

test("scenario 5: replacing demo resolves to the new file - the resolver is a pure function of current items, no stale state", () => {
  const originalDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const before = resolveExerciseMedia([originalDemo, mainImage], "active_workout");
  assert.equal(before?.item.updatedAt, "2026-01-01T00:00:00.000Z");

  // Same role, same path is impossible mid-replace at the resolver level
  // (the assignment flow uploads before removing - see
  // exercise-media-assignment.functions.ts) - what the resolver must get
  // right is: given the post-replace item list, it picks the new one.
  const replacedDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
  const after = resolveExerciseMedia([replacedDemo, mainImage], "active_workout");
  assert.equal(after?.item.updatedAt, "2026-06-01T00:00:00.000Z");
});

test("scenario 6: duplicate files for the same role resolve deterministically to the most recently updated one, regardless of array order", () => {
  const older = mediaItem({
    name: "demo.mov",
    kind: "video",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const newer = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });

  const forward = resolveExerciseMedia([older, newer], "active_workout");
  const backward = resolveExerciseMedia([newer, older], "active_workout");
  assert.equal(forward?.item.name, "demo.mp4");
  assert.equal(backward?.item.name, "demo.mp4");
  assert.equal(forward?.item.name, backward?.item.name);
});

test("scenario 6b: a duplicate with no updatedAt loses to one that has it, and ties keep the first candidate deterministically", () => {
  const undated = mediaItem({ name: "demo.mov", kind: "video", updatedAt: null });
  const dated = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(resolveExerciseMedia([undated, dated], "active_workout")?.item.name, "demo.mp4");
  assert.equal(resolveExerciseMedia([dated, undated], "active_workout")?.item.name, "demo.mp4");

  const bothUndated = mediaItem({ name: "demo.mp4", kind: "video", updatedAt: null });
  assert.equal(
    resolveExerciseMedia([undated, bothUndated], "active_workout")?.item.name,
    "demo.mov",
    "with no dates to compare, the first candidate wins deterministically",
  );
});
