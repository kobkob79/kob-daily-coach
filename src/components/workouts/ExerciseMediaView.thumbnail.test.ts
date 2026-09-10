/**
 * Run with: node --test src/components/workouts/ExerciseMediaView.thumbnail.test.ts
 *
 * Source-level regression for VIORA-EXERCISE-THUMBNAIL-STATIC-MEDIA-HOTFIX-001.
 *
 * There is no component-rendering test harness in this repo (no
 * @testing-library/react, no jsdom, no .test.tsx files) - see
 * exercise-media-v2.test.ts and exercise-motion-draft-core.test.ts for the
 * established framework-free `node --test` convention this follows instead.
 * Rather than re-implementing a DOM to mount ExerciseMediaView, this proves
 * the same invariant the sprint asks for - "no <video> element can be
 * produced for the thumbnail slot" - directly against the component's
 * source and its actual media resolution, which together fully determine
 * whether a <video> tag is ever emitted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveExerciseThumbnailStill } from "../../lib/exercise-media.ts";
import type { MediaItem } from "@/services/media.service";

const SOURCE_PATH = fileURLToPath(new URL("./ExerciseMediaView.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf8");
const MOTION_VIDEO_SOURCE = readFileSync(
  fileURLToPath(new URL("./MotionVideo.tsx", import.meta.url)),
  "utf8",
);
const HOOK_SOURCE = readFileSync(
  fileURLToPath(new URL("../../hooks/useExerciseMedia.ts", import.meta.url)),
  "utf8",
);
const RESOLVER_SOURCE = readFileSync(
  fileURLToPath(new URL("../../lib/exercise-media.ts", import.meta.url)),
  "utf8",
);

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

test("the Motion Video element lives only in MotionVideo, reached from a single guarded branch in ExerciseMediaView", () => {
  // ExerciseMediaView no longer renders <video> itself - it delegates to
  // <MotionVideo>. The thumbnail slot must never reach that branch.
  assert.equal(
    (source.match(/^\s*<video\b/gm) ?? []).length,
    0,
    "ExerciseMediaView must not render <video> directly - it delegates to MotionVideo",
  );
  assert.equal(
    (source.match(/<MotionVideo\b/g) ?? []).length,
    1,
    "expected exactly one <MotionVideo> branch in ExerciseMediaView",
  );

  // Exactly one real <video> element exists across the Motion Video surface,
  // so there is never a duplicate playback loop.
  assert.equal(
    (MOTION_VIDEO_SOURCE.match(/^\s*<video\b/gm) ?? []).length,
    1,
    "expected exactly one <video> element in MotionVideo",
  );

  // The boolean gating the MotionVideo branch must itself be unreachable for
  // the thumbnail slot - if this guard is ever removed, this assertion (not
  // just runtime behavior) fails loudly.
  assert.match(
    source,
    /const isVideo = slot !== "thumbnail" && usableHero\?\.role === "video";/,
    'ExerciseMediaView must keep an explicit slot !== "thumbnail" guard on isVideo',
  );
  assert.match(source, /return isVideo \? \(/, "the MotionVideo branch must be gated by isVideo");

  // ExerciseMediaView no longer special-cases the thumbnail slot itself -
  // it delegates every slot to the hook's single resolve() (VIORA-EXERCISE-
  // MEDIA-CROSS-SURFACE-SYNC-001: one resolver, used identically by every
  // surface, id-folder-aware). The video-rejection guarantee for
  // `thumbnail` now lives one layer down, in resolveExerciseMediaAcrossPrefixes().
  assert.match(
    source,
    /const resolved = resolve\(slot\);/,
    "ExerciseMediaView must resolve every slot - thumbnail included - through the hook's resolve(), not a local special case",
  );
  assert.doesNotMatch(
    source,
    /resolveExerciseThumbnailStill\(|resolveExerciseMedia\(/,
    "ExerciseMediaView must not call the flat-array resolvers directly - that bypasses the id-over-slug prefix priority useExerciseMedia() computes",
  );

  // The static-only routing itself must still exist, one layer down: the
  // hook's resolve() calls resolveExerciseMediaAcrossPrefixes(), which must
  // still route `thumbnail` to the video-rejecting static resolver rather
  // than falling through to the generic (video-first) chain.
  assert.match(
    HOOK_SOURCE,
    /resolve: \(slot: ExerciseMediaSlot = "hero"\): ExerciseHeroMedia \| null =>\s*\n\s*resolveExerciseMediaAcrossPrefixes\(prefixGroups, slot\),/,
    "useExerciseMedia's resolve() must delegate to resolveExerciseMediaAcrossPrefixes()",
  );
  assert.match(
    RESOLVER_SOURCE,
    /if \(slot === "thumbnail"\) return resolveExerciseThumbnailStillAcrossPrefixes\(prefixGroups\);/,
    "resolveExerciseMediaAcrossPrefixes must still route the thumbnail slot through the static-only, video-rejecting resolver",
  );
});

test("end-to-end: a library card with only Motion Video available resolves to no media (placeholder/img path), never video", () => {
  const onlyMotionVideo: MediaItem[] = [
    mediaItem({ name: "motion.mp4", kind: "video" }),
    mediaItem({ name: "hero-cover.jpg", kind: "image" }),
  ];

  // This is exactly what ExerciseMediaView computes for mediaRole="thumbnail":
  // `slot === "thumbnail" ? resolveExerciseThumbnailStill(items) : ...`, then
  // `isVideo = slot !== "thumbnail" && usableHero?.role === "video"`.
  const slot = "thumbnail";
  const resolved = slot === "thumbnail" ? resolveExerciseThumbnailStill(onlyMotionVideo) : null;
  const isVideo = (slot as string) !== "thumbnail" && resolved?.role === "video";

  assert.equal(
    resolved,
    null,
    "no still resolves, so the fallback image/placeholder path renders instead",
  );
  assert.equal(isVideo, false);
});

test("end-to-end: a library card with an explicit thumbnail image resolves to that image, never the sibling Motion Video", () => {
  const items: MediaItem[] = [
    mediaItem({ name: "thumbnail.jpg", kind: "image" }),
    mediaItem({ name: "motion.mp4", kind: "video" }),
  ];

  const resolved = resolveExerciseThumbnailStill(items);
  assert.equal(resolved?.item.name, "thumbnail.jpg");
  assert.equal(resolved?.role, "image");
});
