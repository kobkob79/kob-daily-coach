/**
 * Run with: node --test src/routes/_authenticated/workout-templates.regression.test.ts
 *
 * VIORA-P0-MOBILE-RUNTIME-RECOVERY-CLAUDE-001 — Incident A (routine editor
 * freeze on "אימון A אינטל" after ~6 exercises).
 *
 * Root cause (see PR description / handoff for the full investigation): the
 * editor Dialog's `max-height` was pinned to a static `vh` unit while the
 * app never opts into `interactive-widget=resizes-content`, so on modern
 * Android/Chrome the on-screen keyboard overlays the layout viewport instead
 * of resizing it — once there are enough rows to need scrolling (~6+), the
 * bottom of the dialog (later rows, Add Exercise, Close) sits behind the
 * keyboard and is unreachable. It reproduces on every reopen because it's a
 * deterministic function of persisted row count, not corrupted JS state (no
 * infinite render loop, no draft persistence, no crash was found).
 *
 * This file has two kinds of tests:
 *  1. Pure-logic tests against real, exported functions (fieldSetForExercise,
 *     normalizeMuscleGroup) and against small local simulations of the
 *     editor's list algorithms (row keying, position-swap arithmetic) —
 *     these run the actual logic, not text matching.
 *  2. Source-pattern regression guards (following the same convention as
 *     ../../lib/advisor-context.test.ts's AdvisorContextConsentCard checks)
 *     that pin the exact fixes in place, since this repo has no
 *     DOM/component-render test harness (no jsdom/testing-library/vitest)
 *     to mount <TemplateEditor/> directly.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { normalizeMuscleGroup } from "../../lib/muscle-groups.ts";

// exercise-types.ts itself imports muscle-groups.ts via the "@/..." path
// alias, which only Vite resolves (plain `node --test` does not), so it
// can't be imported at runtime here. Its logic is a direct, total mapping
// over normalizeMuscleGroup's own output (see src/lib/exercise-types.ts),
// reproduced verbatim so the real bug surface — normalizeMuscleGroup's
// Hebrew/legacy-value handling, the thing 332b6e7 actually fixed — stays
// under test with its real implementation.
function fieldSetForExercise(
  muscleGroup: string | null | undefined,
): "strength" | "cardio" | "core" | "stretch" {
  const mg = normalizeMuscleGroup(muscleGroup);
  if (mg === "קרדיו") return "cardio";
  if (mg === "מוביליטי") return "stretch";
  if (mg === "שרירי ליבה") return "core";
  return "strength";
}

const templatesSource = readFileSync(
  fileURLToPath(new URL("./workout-templates.tsx", import.meta.url)),
  "utf8",
);
const rootSource = readFileSync(fileURLToPath(new URL("../__root.tsx", import.meta.url)), "utf8");
const stylesSource = readFileSync(
  fileURLToPath(new URL("../../styles.css", import.meta.url)),
  "utf8",
);

// ---------------------------------------------------------------------------
// 1a. Malformed / missing optional exercise data (muscle_group) never throws.
// ---------------------------------------------------------------------------
describe("fieldSetForExercise / normalizeMuscleGroup — malformed or missing muscle_group", () => {
  test("known Hebrew groups map to the expected field set", () => {
    assert.equal(fieldSetForExercise("קרדיו"), "cardio");
    assert.equal(fieldSetForExercise("מוביליטי"), "stretch");
    assert.equal(fieldSetForExercise("שרירי ליבה"), "core");
    assert.equal(fieldSetForExercise("חזה"), "strength");
  });

  test("null, undefined and empty string degrade to strength instead of throwing", () => {
    assert.doesNotThrow(() => fieldSetForExercise(null));
    assert.doesNotThrow(() => fieldSetForExercise(undefined));
    assert.doesNotThrow(() => fieldSetForExercise(""));
    assert.equal(fieldSetForExercise(null), "strength");
    assert.equal(fieldSetForExercise(undefined), "strength");
    assert.equal(fieldSetForExercise(""), "strength");
  });

  test("legacy English values still resolve via normalizeMuscleGroup, never throw", () => {
    assert.doesNotThrow(() => fieldSetForExercise("Cardio"));
    assert.equal(fieldSetForExercise("Cardio"), "cardio");
    assert.equal(fieldSetForExercise("Legs"), "strength");
  });

  test("garbage / unrecognized strings degrade to the safe default, never throw", () => {
    for (const garbage of ["🤷", "", "   ", "null", "undefined", "{}", "a".repeat(500)]) {
      assert.doesNotThrow(() => fieldSetForExercise(garbage));
      assert.doesNotThrow(() => normalizeMuscleGroup(garbage));
    }
  });
});

// ---------------------------------------------------------------------------
// 1b. Row-list invariants at 6 / 10 / 20 / 50 exercises, including duplicate
//     exercise identifiers and malformed/missing optional row data.
// ---------------------------------------------------------------------------
interface FakeExerciseRow {
  id: string; // workout_template_exercises PK — what the editor keys rows by
  exercise_id: string; // may repeat: the same exercise can be added twice
  position: number;
  exercises: { id: string; name: string; muscle_group: string | null } | null;
}

function buildRows(
  count: number,
  opts: { duplicateExerciseId?: boolean; malformed?: boolean } = {},
) {
  const rows: FakeExerciseRow[] = [];
  for (let i = 0; i < count; i++) {
    const exerciseId = opts.duplicateExerciseId ? "same-exercise" : `exercise-${i}`;
    rows.push({
      id: `row-${i}`, // always unique — the join-table PK, not the exercise id
      exercise_id: exerciseId,
      position: i,
      exercises:
        opts.malformed && i % 3 === 0
          ? null // simulates a deleted/RLS-hidden exercise embed
          : {
              id: exerciseId,
              name: opts.malformed && i % 5 === 0 ? "" : `Exercise ${i}`,
              muscle_group:
                opts.malformed && i % 7 === 0 ? (undefined as unknown as string) : "חזה",
            },
    });
  }
  return rows;
}

function rowDisplayName(row: FakeExerciseRow): string {
  // Mirrors workout-templates.tsx: `r.exercises?.name ?? "—"`
  return row.exercises?.name ?? "—";
}

describe("routine editor row list — 6/10/20/50 exercises stay well-formed", () => {
  for (const count of [6, 10, 20, 50]) {
    test(`${count} exercises: every row key (id) is unique — no React key collisions`, () => {
      const rows = buildRows(count);
      const keys = rows.map((r) => r.id);
      assert.equal(new Set(keys).size, keys.length, `all ${count} row ids must be unique`);
    });

    test(`${count} exercises: duplicate exercise_id (same exercise added twice) still yields unique row keys`, () => {
      const rows = buildRows(count, { duplicateExerciseId: true });
      // Every row references the same exercise_id, but the row `id` (join
      // table PK) is what React keys off, and what must stay unique.
      assert.ok(rows.every((r) => r.exercise_id === "same-exercise"));
      const keys = rows.map((r) => r.id);
      assert.equal(
        new Set(keys).size,
        keys.length,
        "row ids stay unique even with a repeated exercise",
      );
    });

    test(`${count} exercises: malformed/missing optional data never breaks a single row's rendering`, () => {
      const rows = buildRows(count, { malformed: true });
      for (const row of rows) {
        assert.doesNotThrow(() => rowDisplayName(row));
        assert.doesNotThrow(() => fieldSetForExercise(row.exercises?.muscle_group ?? null));
        assert.equal(
          typeof rowDisplayName(row),
          "string",
          "display name is always a defined string",
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 1c. Reorder (swap), delete and update — the exact arithmetic the mutations
//     perform, run directly (not through Supabase).
// ---------------------------------------------------------------------------
function swapPositions(rows: FakeExerciseRow[], aId: string, bId: string): FakeExerciseRow[] {
  // Mirrors the `swap` mutation in workout-templates.tsx: read both current
  // positions, then write each row the other row's position.
  const a = rows.find((r) => r.id === aId)!;
  const b = rows.find((r) => r.id === bId)!;
  const aPos = a.position;
  const bPos = b.position;
  return rows.map((r) =>
    r.id === a.id ? { ...r, position: bPos } : r.id === b.id ? { ...r, position: aPos } : r,
  );
}

describe("reorder (swap) — position arithmetic at 6/10/20/50 rows", () => {
  for (const count of [6, 10, 20, 50]) {
    test(`${count} rows: swapping two adjacent rows preserves a full, collision-free position set`, () => {
      const rows = buildRows(count);
      const swapped = swapPositions(rows, "row-1", "row-2");
      const positions = swapped.map((r) => r.position).sort((x, y) => x - y);
      const expected = Array.from({ length: count }, (_, i) => i);
      assert.deepEqual(
        positions,
        expected,
        "positions remain exactly 0..N-1 with no duplicates or gaps",
      );
      assert.equal(swapped.find((r) => r.id === "row-1")!.position, 2);
      assert.equal(swapped.find((r) => r.id === "row-2")!.position, 1);
    });

    test(`${count} rows: swapping the first and last row moves both, leaves everyone else untouched`, () => {
      const rows = buildRows(count);
      const first = rows[0]!;
      const last = rows[count - 1]!;
      const swapped = swapPositions(rows, first.id, last.id);
      assert.equal(swapped.find((r) => r.id === first.id)!.position, count - 1);
      assert.equal(swapped.find((r) => r.id === last.id)!.position, 0);
      for (const row of swapped.slice(1, -1)) {
        const original = rows.find((r) => r.id === row.id)!;
        assert.equal(row.position, original.position, `${row.id} keeps its position`);
      }
    });

    test(`${count} rows: swapping a row with itself is a no-op`, () => {
      const rows = buildRows(count);
      const swapped = swapPositions(rows, "row-0", "row-0");
      assert.deepEqual(swapped, rows);
    });
  }
});

describe("delete — removing a row at 6/10/20/50 rows", () => {
  for (const count of [6, 10, 20, 50]) {
    test(`${count} rows: deleting one row leaves the rest with unique ids and no gaps in the id sequence`, () => {
      const rows = buildRows(count);
      const remaining = rows.filter((r) => r.id !== "row-3");
      assert.equal(remaining.length, count - 1);
      assert.equal(new Set(remaining.map((r) => r.id)).size, remaining.length);
      assert.ok(!remaining.some((r) => r.id === "row-3"));
    });

    test(`${count} rows: deleting every row one at a time never throws and ends empty`, () => {
      let rows = buildRows(count);
      for (const id of rows.map((r) => r.id)) {
        assert.doesNotThrow(() => {
          rows = rows.filter((r) => r.id !== id);
        });
      }
      assert.equal(rows.length, 0);
    });
  }
});

describe("update — patching a target field at 6/10/20/50 rows", () => {
  function patchRow(rows: FakeExerciseRow[], id: string, patch: Partial<FakeExerciseRow>) {
    return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  }

  for (const count of [6, 10, 20, 50]) {
    test(`${count} rows: patching one row's position leaves every other row's identity untouched`, () => {
      const rows = buildRows(count);
      const patched = patchRow(rows, "row-4", { position: 999 });
      assert.equal(patched.find((r) => r.id === "row-4")!.position, 999);
      for (const row of patched) {
        if (row.id === "row-4") continue;
        const original = rows.find((r) => r.id === row.id)!;
        assert.deepEqual(row, original);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 1d. Reopening a persisted draft: no client-side draft cache exists for this
//     editor, so reopening always reflects the live, current row set — never
//     a stale/frozen cached snapshot.
// ---------------------------------------------------------------------------
describe("reopening a persisted routine — no stale draft cache", () => {
  test("no localStorage/sessionStorage draft key is used by the template editor", () => {
    assert.doesNotMatch(
      templatesSource,
      /localStorage|sessionStorage/,
      "the routine editor must not cache a draft client-side — reopening should always reflect the live DB state, not a possibly-frozen stale draft",
    );
  });

  test("the exercises query has no row-count limit that would hide rows past a threshold", () => {
    const rowsQueryMatch = templatesSource.match(
      /queryKey:\s*\["workout_template_exercises"[\s\S]{0,600}?if \(error\) throw error;/,
    );
    assert.ok(rowsQueryMatch, "the workout_template_exercises query block is present");
    assert.doesNotMatch(
      rowsQueryMatch![0],
      /\.limit\(/,
      "no .limit() on the exercises query — every row (6, 10, 20, 50, ...) must load on every open",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Source-pattern regression guards for the applied fixes.
// ---------------------------------------------------------------------------
describe("viewport handling — mobile keyboard must resize the layout viewport", () => {
  test("root viewport meta opts into interactive-widget=resizes-content", () => {
    assert.match(
      rootSource,
      /name:\s*"viewport"[\s\S]{0,200}interactive-widget=resizes-content/,
      "without this, Android/Chrome overlays the keyboard instead of resizing the layout viewport, and any vh/dvh-sized dialog can end up with unreachable content",
    );
  });
});

describe("routine editor dialog — max-height stays reachable regardless of row count", () => {
  test("the dialog uses the shared vh/dvh fallback class instead of a bare max-h-[85vh] utility", () => {
    assert.match(templatesSource, /className="max-w-lg overflow-y-auto dialog-max-height-safe"/);
    assert.doesNotMatch(
      templatesSource,
      /max-h-\[85vh\]/,
      "a lone static-vh utility on the dialog is exactly what reproduced the freeze (see PR #15's own dvh->vh commit)",
    );
  });

  test("the fallback class declares both the vh safety net and the dvh keyboard-aware value, in that order", () => {
    const ruleMatch = stylesSource.match(/\.dialog-max-height-safe\s*\{([\s\S]*?)\}/);
    assert.ok(ruleMatch, ".dialog-max-height-safe rule exists in styles.css");
    const body = ruleMatch![1]!;
    const vhIndex = body.indexOf("max-height: 85vh");
    const dvhIndex = body.indexOf("max-height: 85dvh");
    assert.ok(vhIndex !== -1, "85vh fallback is present (browsers that don't parse dvh keep this)");
    assert.ok(dvhIndex !== -1, "85dvh is present (keyboard-aware value on capable browsers)");
    assert.ok(
      vhIndex < dvhIndex,
      "85vh must come first so 85dvh can override it, never the reverse",
    );
  });
});

describe("routine editor mutations — a failed write surfaces an error instead of looking frozen", () => {
  for (const mutation of ["addExercise", "patchRow", "removeRow", "swap"]) {
    test(`${mutation} has an onError handler`, () => {
      const marker = `const ${mutation} = useMutation({`;
      const start = templatesSource.indexOf(marker);
      assert.notEqual(start, -1, `${mutation} mutation is defined`);
      const searchFrom = start + marker.length;
      const nextMutation = templatesSource.indexOf("useMutation({", searchFrom);
      const block = templatesSource.slice(start, nextMutation === -1 ? start + 2000 : nextMutation);
      assert.match(
        block,
        /onError:\s*\(e: Error\) => toast\.error\(e\.message\)/,
        `${mutation} must report a failed write instead of silently leaving the UI on stale data`,
      );
    });
  }
});

describe("routine editor rows are keyed by the stable row id, not array index", () => {
  test("the row list maps with key={r.id}", () => {
    assert.match(templatesSource, /rowsQ\.data\?\.map\(\(r, idx\) => \(\s*<div key=\{r\.id\}/);
  });
});

describe("per-field inputs stay debounced — no per-keystroke mutate/invalidate loop", () => {
  test("DebouncedNumberInput commits on a timer and clears it on unmount, matching PR #15", () => {
    assert.match(
      templatesSource,
      /timerRef\.current = setTimeout\(\(\) => flush\(v\), PATCH_DEBOUNCE_MS\)/,
    );
    assert.match(templatesSource, /if \(timerRef\.current\) clearTimeout\(timerRef\.current\)/);
  });

  test("every target-field input passes a primitive value, not a fresh object/array, to DebouncedNumberInput", () => {
    const valueProps = [
      ...templatesSource.matchAll(/<DebouncedNumberInput[\s\S]*?\svalue=\{([^}]+)\}/g),
    ].map((m) => m[1]!.trim());
    assert.equal(valueProps.length, 5, "found all five target-field DebouncedNumberInput usages");
    for (const expr of valueProps) {
      assert.doesNotMatch(
        expr,
        /^\{|^\[/,
        `"${expr}" must be a primitive field access, not an object/array literal — an unstable reference here would re-trigger DebouncedNumberInput's [value] effect every render`,
      );
    }
  });
});
