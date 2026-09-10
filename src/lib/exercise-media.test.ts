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
  combineExerciseMediaPrefixResults,
  pickHeroMedia,
  pickRoleMediaAcrossPrefixes,
  resolveExerciseMedia,
  resolveExerciseMediaAcrossPrefixes,
  resolveExerciseThumbnailStill,
  resolveExerciseThumbnailStillAcrossPrefixes,
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

// ============================================================================
// VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001, finding F2
//
// The exercise-id folder is the source of truth; the name-slug folder
// (exerciseMediaPrefixes()'s "convenience for manual uploads made by
// name") is a per-role fallback ONLY - consulted at all only when the id
// folder has no file for that role. A role that exists in the id folder
// can never lose to the same role in the slug folder, no matter how much
// more recently the slug-folder file was updated. `updatedAt` only ever
// breaks ties between duplicates *within* the same folder (see
// pickMostRecentlyUpdated() above) - it must never leak across folders.
// ============================================================================

test("F2 scenario: an id-folder demo beats a newer slug-folder demo, in both group orderings", () => {
  const idFolderDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2020-01-01T00:00:00.000Z", // much older
  });
  const slugFolderDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2030-01-01T00:00:00.000Z", // much newer - must still lose
  });

  // pickRoleMediaAcrossPrefixes takes ordered groups: [idGroup, slugGroup].
  const resolved = pickRoleMediaAcrossPrefixes([[idFolderDemo], [slugFolderDemo]], "demo");
  assert.equal(resolved?.item.path, idFolderDemo.path);
  assert.equal(
    resolved?.item.updatedAt,
    "2020-01-01T00:00:00.000Z",
    "the id-folder file must win even though the slug-folder file is far more recently updated",
  );
});

test("F2 scenario: the slug folder is used only when the id folder has no file for that role", () => {
  const slugFolderDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });

  // id folder (first group) is empty for this role.
  const resolved = pickRoleMediaAcrossPrefixes([[], [slugFolderDemo]], "demo");
  assert.equal(resolved?.item.path, slugFolderDemo.path);
});

test("F2 scenario: reversed timestamps still cannot make the slug folder win when the id folder has the role", () => {
  const idFolderDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2030-01-01T00:00:00.000Z", // now the id-folder file is the newer one
  });
  const slugFolderDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });

  const resolved = pickRoleMediaAcrossPrefixes([[idFolderDemo], [slugFolderDemo]], "demo");
  assert.equal(resolved?.item.path, idFolderDemo.path);
});

test("F2 scenario: updatedAt only breaks ties among duplicates within the SAME group, never across groups", () => {
  // Two id-folder duplicates for the same role (a legacy/duplicate-upload
  // scenario) - pickMostRecentlyUpdated() must pick between THESE two, and
  // the (even newer) slug-folder file must still never be considered at
  // all, since the id folder already has an answer for this role.
  const idFolderOlder = mediaItem({
    name: "demo.mov",
    kind: "video",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  const idFolderNewer = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2021-01-01T00:00:00.000Z",
  });
  const slugFolderNewest = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  const resolved = pickRoleMediaAcrossPrefixes(
    [[idFolderOlder, idFolderNewer], [slugFolderNewest]],
    "demo",
  );
  assert.equal(
    resolved?.item.path,
    idFolderNewer.path,
    "the more recent of the two id-folder duplicates wins - the slug folder is never reached",
  );
});

test("F2 scenario: array order within a group does not matter (both orderings of the id-folder duplicates)", () => {
  const older = mediaItem({
    name: "demo.mov",
    kind: "video",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  const newer = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2021-01-01T00:00:00.000Z",
  });
  const slug = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  const forward = pickRoleMediaAcrossPrefixes([[older, newer], [slug]], "demo");
  const backward = pickRoleMediaAcrossPrefixes([[newer, older], [slug]], "demo");
  assert.equal(forward?.item.path, newer.path);
  assert.equal(backward?.item.path, newer.path);
});

test("F2 scenario: resolveExerciseThumbnailStillAcrossPrefixes never lets a slug-folder thumbnail beat an id-folder one", () => {
  const idThumbnail = mediaItem({
    name: "thumbnail.jpg",
    kind: "image",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  const slugThumbnail = mediaItem({
    name: "thumbnail.jpg",
    kind: "image",
    path: "exercises/plank-classic/thumbnail.jpg",
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  const resolved = resolveExerciseThumbnailStillAcrossPrefixes([[idThumbnail], [slugThumbnail]]);
  assert.equal(resolved?.item.path, idThumbnail.path);
});

test("F2 scenario: resolveExerciseMediaAcrossPrefixes(active_workout) resolves an id-folder demo over a newer slug-folder demo", () => {
  const idDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  const slugDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
    updatedAt: "2099-01-01T00:00:00.000Z",
  });

  const resolved = resolveExerciseMediaAcrossPrefixes([[idDemo], [slugDemo]], "active_workout");
  assert.equal(resolved?.item.path, idDemo.path);
});

test("F2 scenario: resolveExerciseMediaAcrossPrefixes falls through role-by-role - a slug main is used only once the id folder has neither demo nor main", () => {
  const idThumbnailOnly = mediaItem({
    name: "thumbnail.jpg",
    kind: "image",
    updatedAt: "2099-01-01T00:00:00.000Z", // newer, but a lower-priority role
  });
  const slugMain = mediaItem({
    name: "main.jpg",
    kind: "image",
    path: "exercises/plank-classic/main.jpg",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });

  // id folder has no demo and no main for this exercise - only a thumbnail.
  // The slug folder's main must be used ahead of falling back to the id
  // folder's thumbnail, since main outranks thumbnail in the
  // active_workout/exercise_details fallback chain regardless of folder.
  const resolved = resolveExerciseMediaAcrossPrefixes(
    [[idThumbnailOnly], [slugMain]],
    "active_workout",
  );
  assert.equal(resolved?.item.path, slugMain.path);
});

// ============================================================================
// VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001, finding F11
//
// The id folder must stay authoritative even when its own Storage listing
// fails transiently - a failed listing must never be indistinguishable
// from "the id folder was listed successfully and is genuinely empty,"
// since the latter is exactly what makes the resolver fall through to a
// (possibly stale) slug-folder file.
// ============================================================================

function fulfilled(items: MediaItem[]): PromiseFulfilledResult<MediaItem[]> {
  return { status: "fulfilled", value: items };
}
function rejected(reason: unknown): PromiseRejectedResult {
  return { status: "rejected", reason };
}

test("F11 scenario (successful-empty): the id folder lists successfully and is genuinely empty - the slug folder is used as a normal fallback", () => {
  const slugDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
  });

  const groups = combineExerciseMediaPrefixResults([fulfilled([]), fulfilled([slugDemo])]);
  assert.deepEqual(groups, [[], [slugDemo]]);

  const resolved = resolveExerciseMediaAcrossPrefixes(groups, "active_workout");
  assert.equal(
    resolved?.item.path,
    slugDemo.path,
    "a genuinely empty (successfully listed) id folder must still fall back to the slug folder normally",
  );
});

test("F11 scenario (failed listing): a failed id-folder listing throws rather than resolving to an empty group", () => {
  const listingError = new Error("network timeout");

  assert.throws(
    () => combineExerciseMediaPrefixResults([rejected(listingError), fulfilled([])]),
    (err: unknown) => err === listingError,
    "a failed id-folder listing must propagate as a failure, never silently become an empty (and therefore skippable) group",
  );
});

test("F11 scenario (failed listing): the failure is thrown even when the slug folder has a file that would otherwise look like a valid fallback", () => {
  const listingError = new Error("network timeout");
  const staleSlugDemo = mediaItem({
    name: "demo.mp4",
    kind: "video",
    path: "exercises/plank-classic/demo.mp4",
  });

  assert.throws(
    () => combineExerciseMediaPrefixResults([rejected(listingError), fulfilled([staleSlugDemo])]),
    (err: unknown) => err === listingError,
    "the id folder's listing failure must take priority over the slug folder having a file at all - " +
      "a caller must never be able to resolve staleSlugDemo as if the id folder were confirmed empty",
  );
});

test("F11: a failed slug-folder listing (not the id folder) is safe to treat as an empty group", () => {
  const idDemo = mediaItem({ name: "demo.mp4", kind: "video" });
  const listingError = new Error("network timeout");

  const groups = combineExerciseMediaPrefixResults([fulfilled([idDemo]), rejected(listingError)]);
  assert.deepEqual(groups, [[idDemo], []]);

  const resolved = resolveExerciseMediaAcrossPrefixes(groups, "active_workout");
  assert.equal(resolved?.item.path, idDemo.path);
});

test("F11: a failed slug-folder listing does not prevent resolving normally when the id folder is genuinely empty for a role", () => {
  const idThumbnailOnly = mediaItem({ name: "thumbnail.jpg", kind: "image" });
  const listingError = new Error("network timeout");

  // id folder has no demo/main for this exercise, only a thumbnail; the
  // slug folder's listing itself failed. Per policy, a failed slug listing
  // becomes an empty group - the id folder's own thumbnail-only answer for
  // library_card still resolves normally.
  const groups = combineExerciseMediaPrefixResults([
    fulfilled([idThumbnailOnly]),
    rejected(listingError),
  ]);
  const resolved = resolveExerciseMediaAcrossPrefixes(groups, "thumbnail");
  assert.equal(resolved?.item.path, idThumbnailOnly.path);
});

test("F11: within a successfully listed group, duplicate paths are deduped", () => {
  const item = mediaItem({ name: "demo.mp4", kind: "video" });
  const duplicatePath = { ...item }; // same .path, simulating a paginated re-listing
  const groups = combineExerciseMediaPrefixResults([
    fulfilled([item, duplicatePath]),
    fulfilled([]),
  ]);
  assert.equal(groups[0].length, 1);
});
