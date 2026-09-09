/**
 * Run with: node --test src/hooks/useExerciseMedia.test.ts
 *
 * Source-level regression for VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001.
 *
 * Root cause of the "Motion Video published, still shows old media" bug's
 * V2-exposure angle: `exercises/<id>/v2/<mediaVersionId>/motion.<token>.mp4`
 * (see exercise-media-v2.ts's buildMotionVideoStoragePath) sits one Storage
 * folder level below the exercise root. The `exercise_media_versions`/
 * `exercise_media_assets` tables gate a draft/rejected video by RLS, but the
 * `exercise-assets` Storage bucket's own read policy does not - any
 * authenticated user can list and sign any object in the bucket regardless
 * of publish status (see the "Authenticated users can read exercise assets"
 * policy). A Storage-tree scan that walks into `v2/` would therefore leak
 * unpublished Motion Video drafts onto every surface using useExerciseMedia
 * (ExerciseHero, ExerciseMediaView), since resolveExerciseMedia()'s generic
 * hero pick has no way to tell a canonical top-level file from a nested V2
 * draft once both are in the same `items` array.
 *
 * The fix scopes the scan to the exercise's own top-level files only
 * (`maxDepth: 0`), which the assignment flow already writes to
 * exclusively. This is a source-level test (not a live-Storage one) for the
 * same reason ExerciseHero.test.ts and
 * ExerciseMediaView.thumbnail.test.ts are: no Supabase/network test harness
 * exists in this repo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./useExerciseMedia.ts", import.meta.url)),
  "utf8",
);

test("the exercise media Storage scan never descends into nested folders (maxDepth: 0)", () => {
  assert.match(
    source,
    /listMediaTree\(\{ bucket: ASSETS_BUCKET, prefix, maxDepth: 0, maxFiles: 60 \}\)/,
    "maxDepth must stay 0 so a v2/<mediaVersionId>/ Motion Video draft folder is never walked into - " +
      "see the module doc for why this is a genuine unpublished-media exposure, not just tidiness",
  );
});

test("no leftover maxDepth value greater than 0 for this scan", () => {
  assert.doesNotMatch(source, /maxDepth:\s*[1-9]/);
});

test("F11: prefix listings use Promise.allSettled and are combined through combineExerciseMediaPrefixResults, not a blanket .catch(() => [])", () => {
  assert.match(
    source,
    /Promise\.allSettled\(/,
    "must use allSettled so a failed id-folder listing can be told apart from a failed slug-folder listing",
  );
  assert.match(source, /combineExerciseMediaPrefixResults\(settled\)/);
  assert.doesNotMatch(
    source,
    /\.catch\(\s*\(\)\s*=>\s*\[\]/,
    "a per-prefix blanket .catch(() => []) would make a failed id-folder listing indistinguishable from a " +
      "genuinely empty one, letting a stale slug-folder file win by default - see finding F11",
  );
});
