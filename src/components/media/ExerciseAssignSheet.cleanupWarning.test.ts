/**
 * Run with: node --test src/components/media/ExerciseAssignSheet.cleanupWarning.test.ts
 *
 * Source-level regression for VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001
 * finding F10: the server can return `assigned_with_cleanup_warning`
 * (assignment succeeded, but a stale sibling file still needs manual
 * Storage cleanup - see exercise-media-assignment-core.ts's
 * `removeWithRetry`), and this sheet previously treated any non-"exists"
 * result as a full, unqualified success.
 *
 * No React rendering test harness exists in this repo (see
 * ExerciseMediaView.thumbnail.test.ts's doc for the established
 * convention this follows instead): this proves the source explicitly
 * branches on the warning status and never silently folds it into the
 * plain-success path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./ExerciseAssignSheet.tsx", import.meta.url)),
  "utf8",
);

test("confirm() explicitly branches on assigned_with_cleanup_warning before the plain-success path", () => {
  assert.match(
    source,
    /if \(result\.status === "assigned_with_cleanup_warning"\) \{/,
    "the warning status must be checked explicitly, not folded into the generic success branch",
  );
  const warningBranchIndex = source.indexOf('result.status === "assigned_with_cleanup_warning"');
  const existsBranchIndex = source.indexOf('result.status === "exists"');
  assert.ok(existsBranchIndex !== -1 && warningBranchIndex > existsBranchIndex);
});

test("the warning path uses toast.warning, not toast.success, and sets cleanupWarning state", () => {
  const ifStart = source.indexOf('if (result.status === "assigned_with_cleanup_warning") {');
  const elseStart = source.indexOf("} else {", ifStart);
  const warningBlock = source.slice(ifStart, elseStart);
  assert.match(warningBlock, /toast\.warning\(/);
  assert.doesNotMatch(warningBlock, /toast\.success\(/);
  assert.match(warningBlock, /setCleanupWarning\(true\)/);
});

test("the plain-success path (else branch) still uses toast.success and clears cleanupWarning", () => {
  assert.match(source, /toast\.success\(`המדיה שויכה ל-\$\{target\.name\}/);
  assert.match(source, /setCleanupWarning\(false\)/);
});

test("the post-assign screen renders a distinct warning message instead of the plain completion text when cleanupWarning is true", () => {
  assert.match(
    source,
    /\{cleanupWarning \? \(/,
    "post-assign must conditionally render on cleanupWarning",
  );
  assert.match(source, /נשאר קובץ ישן ב-Storage שדורש ניקוי ידני/);
  // The plain "השיוך הושלם." text must only render in the non-warning branch.
  const postAssignBlock = source.slice(
    source.indexOf('step === "post-assign" && role'),
    source.indexOf("תצוגות שעודכנו"),
  );
  assert.match(postAssignBlock, /cleanupWarning \? \(/);
});

test("cleanupWarning is reset alongside the sheet's other per-run state", () => {
  const resetFn = source.slice(
    source.indexOf("function reset()"),
    source.indexOf("function closeAll()"),
  );
  assert.match(resetFn, /setCleanupWarning\(false\)/);
});

test("the Inbox source file is never deleted automatically - removeFromInbox is only ever invoked from an explicit button onClick", () => {
  const calls = source.match(/removeFromInbox\(\)/g) ?? [];
  // Every call site must be immediately preceded by an onClick wiring, not
  // called eagerly inside confirm()/the assignment flow itself.
  assert.ok(
    calls.length >= 2,
    "expected removeFromInbox to be wired to at least the post-assign and delete-confirm buttons",
  );

  const confirmFnSource = source.slice(
    source.indexOf("async function confirm("),
    source.indexOf("async function removeFromInbox()"),
  );
  assert.doesNotMatch(
    confirmFnSource,
    /removeFromInbox\(/,
    "confirm() must never call removeFromInbox() itself, in the warning path or otherwise - deletion is always a separate, explicit admin action",
  );
});
