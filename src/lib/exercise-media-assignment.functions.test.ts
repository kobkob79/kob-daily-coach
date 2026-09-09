/**
 * Run with: node --test src/lib/exercise-media-assignment.functions.test.ts
 *
 * Source-level regression for VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001,
 * Part 3 ("upload failure must never lose the currently-active media").
 *
 * assignExerciseMediaServer() is a TanStack Start server function whose
 * handler resolves a real `supabaseAdmin` client via a dynamic import -
 * there is no dependency-injection seam like exercise-motion-draft-core.ts
 * has, and adding one is a larger refactor than this bug fix calls for.
 * Rather than mocking the Supabase client, this proves the same invariant
 * the ticket asks for - "the old file is never removed before the new one
 * is durably saved" - directly against the handler's source, the same
 * technique ExerciseHero.test.ts and ExerciseMediaView.thumbnail.test.ts
 * already use for scenarios this repo has no component/integration harness
 * for.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./exercise-media-assignment.functions.ts", import.meta.url)),
  "utf8",
);

test("upload happens before any existing file for the role is removed", () => {
  const uploadIndex = source.indexOf(".upload(destinationPath");
  const removeIndex = source.indexOf(".remove(staleSiblingPaths");
  assert.notEqual(uploadIndex, -1, "expected an .upload(destinationPath, ...) call");
  assert.notEqual(removeIndex, -1, "expected a .remove(staleSiblingPaths) call");
  assert.ok(
    uploadIndex < removeIndex,
    "the new file must be uploaded before any existing sibling is removed - " +
      "otherwise a failed upload leaves the exercise with no media for this role",
  );
});

test("a failed upload throws before any removal call is reached", () => {
  assert.match(
    source,
    /upload\(destinationPath, sourceBlob, \{[\s\S]*?\}\);\s*\n\s*\n\s*if \(uploadError\) \{\s*\n\s*throw new Error\(uploadError\.message\);\s*\n\s*\}/,
    "an upload error must throw immediately, before the stale-sibling removal block runs",
  );
});

test("the upload uses upsert: true, so a same-extension replacement overwrites atomically rather than via a delete-then-insert gap", () => {
  assert.match(source, /upsert:\s*true/);
  assert.doesNotMatch(
    source,
    /upsert:\s*false/,
    "upsert: false would require removing the old file first, reopening the upload-failure data-loss window",
  );
});

test("every existing file for the role is located (filter), not just the first match", () => {
  assert.match(
    source,
    /const existingRoleFiles = \(existingFiles \?\? \[\]\)\.filter\(/,
    "must use .filter() to find every sibling for the role, not .find() (which only locates one and " +
      "leaves duplicates like demo.mov behind after a demo.mp4 replacement)",
  );
});

test("stale-sibling cleanup never removes the file that was just uploaded", () => {
  assert.match(
    source,
    /\.filter\(\(path\) => path !== destinationPath\)/,
    "the cleanup step must exclude destinationPath itself from the removal list",
  );
});

test("a stale-sibling cleanup failure is logged, not thrown - the assignment already succeeded", () => {
  const removeErrorHandling = source.slice(source.indexOf("if (staleSiblingPaths.length > 0)"));
  assert.match(
    removeErrorHandling,
    /if \(removeError\) \{\s*\n\s*console\.error\(/,
    "cleanup failure must be logged, not thrown, so a successful assignment is never reported as failed",
  );
  assert.doesNotMatch(
    removeErrorHandling.slice(0, removeErrorHandling.indexOf("console.error")),
    /throw new Error/,
  );
});
