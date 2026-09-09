/**
 * Run with: node --test src/components/HomeEscapeButton.test.ts
 *
 * Source-level regression (no React render harness in this repo — see
 * src/components/workouts/ExerciseHero.test.ts for the same technique).
 *
 * Covers the Codex re-review findings on PR #47:
 *  - F1: the summary-screen dialog must not claim unsaved feedback is safe.
 *  - F2: confirmKind is a closed union, not a blanket boolean — Cancel never
 *    navigates, Confirm always goes to HOME_ROUTE, and a null confirmKind
 *    skips the dialog entirely.
 *  - F3: no "תוכל/י"-style gendered phrasing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./HomeEscapeButton.tsx", import.meta.url)),
  "utf8",
);

test("confirmKind is a closed HomeEscapeConfirmKind union, not a boolean", () => {
  assert.match(source, /confirmKind\?: HomeEscapeConfirmKind/);
  assert.doesNotMatch(source, /confirmBeforeLeave/, "the old boolean prop must be fully replaced");
});

test("a null/omitted confirmKind skips the dialog and navigates straight home", () => {
  assert.match(
    source,
    /const handleClick = \(\) => \{\s*if \(confirmKind\) \{\s*setConfirmOpen\(true\);\s*return;\s*\}\s*goHome\(\);\s*\};/,
  );
});

test("Cancel never navigates — AlertDialogCancel carries no onClick, just closes", () => {
  assert.match(source, /<AlertDialogCancel>ביטול<\/AlertDialogCancel>/);
});

test("Confirm always routes through goHome(), which targets HOME_ROUTE", () => {
  assert.match(
    source,
    /<AlertDialogAction onClick=\{goHome\}>\{copy\.confirmLabel\}<\/AlertDialogAction>/,
  );
  assert.match(
    source,
    /const goHome = \(\) => \{\s*setConfirmOpen\(false\);\s*navigate\(\{ to: HOME_ROUTE \}\);\s*\};/,
  );
});

test("active_workout copy never claims everything is already saved", () => {
  const match = source.match(/active_workout:\s*\{([\s\S]*?)\},\s*unsaved_summary:/);
  assert.ok(match, "expected an active_workout entry in DIALOG_COPY");
  const block = match[1];
  assert.doesNotMatch(block, /לא הולך לאיבוד/, "must not promise nothing is lost");
  assert.doesNotMatch(block, /נשמר/, "must not claim anything was saved");
});

test("unsaved_summary copy explicitly warns that unsaved feedback will be discarded", () => {
  const match = source.match(/unsaved_summary:\s*\{([\s\S]*?)\},\s*\};/);
  assert.ok(match, "expected an unsaved_summary entry in DIALOG_COPY");
  const block = match[1];
  assert.match(block, /לא נשמר/, "must state the feedback is not yet saved");
  assert.match(block, /תמחק/, "must warn that leaving discards it");
  assert.doesNotMatch(block, /לא הולך לאיבוד/, "must not contradict itself by promising safety");
});

test("no gendered 'תוכל/י' phrasing anywhere in the dialog copy", () => {
  assert.doesNotMatch(source, /תוכל\/י/);
});

test("the button keeps its required accessibility contract", () => {
  assert.match(source, /aria-label="חזרה לעמוד הבית"/);
  assert.match(source, /h-11 w-11/, "44x44 touch target");
  assert.match(source, /focus-visible:ring-2/, "visible focus state");
});
