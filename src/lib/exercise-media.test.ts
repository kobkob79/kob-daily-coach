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
