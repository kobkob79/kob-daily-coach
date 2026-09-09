/**
 * Run with: node --test src/lib/community-workout-share.test.ts
 *
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1 — the workout_result payload
 * builder is the source of truth for both the live preview and the
 * published post, so every rule from the sprint's "Workout Truth Rules"
 * and "Partial workout behavior" sections is proven here directly, not
 * just documented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkoutSharePayload,
  formatExerciseSetLine,
  formatSetCompletionLabel,
  type BuildWorkoutSharePayloadInput,
  type WorkoutShareSourceSet,
} from "./community-workout-share.ts";

const EX_BENCH = "ex-bench";
const EX_SQUAT = "ex-squat";
const EX_CURL = "ex-curl";

function exercisesById() {
  return new Map([
    [EX_BENCH, { name: "לחיצת חזה במכונה", muscle_group: "חזה" }],
    [EX_SQUAT, { name: "סקוואט", muscle_group: "רגליים" }],
    [EX_CURL, { name: "כפיפת מרפק", muscle_group: "יד קדמית" }],
  ]);
}

function set(overrides: Partial<WorkoutShareSourceSet>): WorkoutShareSourceSet {
  return {
    exercise_id: EX_BENCH,
    set_number: 1,
    weight_kg: 30,
    reps: 12,
    is_warmup: false,
    completed_at: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

function baseInput(sets: WorkoutShareSourceSet[]): BuildWorkoutSharePayloadInput {
  return {
    session: { name: "יום חזה", started_at: "2026-09-08T09:30:00.000Z", duration_seconds: 2700 },
    sets,
    exercisesById: exercisesById(),
    caption: null,
    locationLabel: null,
    coach: null,
  };
}

test("only completed sets contribute to metrics", () => {
  const sets = [
    set({ set_number: 1, weight_kg: 30, reps: 12, completed_at: "2026-09-08T10:00:00.000Z" }),
    set({ set_number: 2, weight_kg: 40, reps: 12, completed_at: null }), // not done
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.completedSetCount, 1);
  assert.equal(payload.plannedSetCount, 2);
  assert.equal(payload.totalReps, 12);
  assert.equal(payload.totalVolumeKg, 360);
});

test("empty planned exercises (zero completed sets) are excluded from the breakdown", () => {
  const sets = [
    set({ exercise_id: EX_BENCH, completed_at: "2026-09-08T10:00:00.000Z" }),
    set({ exercise_id: EX_SQUAT, completed_at: null }), // planned, never done
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.exercises.length, 1);
  assert.equal(payload.exercises[0]!.name, "לחיצת חזה במכונה");
});

test('partial workout: "3 מתוך 31" can never become "3/3"', () => {
  const sets = [
    ...Array.from({ length: 3 }, (_, i) =>
      set({ set_number: i + 1, completed_at: "2026-09-08T10:00:00.000Z" }),
    ),
    ...Array.from({ length: 28 }, (_, i) => set({ set_number: i + 4, completed_at: null })),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.completedSetCount, 3);
  assert.equal(payload.plannedSetCount, 31);
  assert.equal(payload.isPartial, true);
  assert.equal(formatSetCompletionLabel(payload), "3 מתוך 31 סטים הושלמו");
  assert.notEqual(formatSetCompletionLabel(payload), "3 מתוך 3 סטים הושלמו");
});

test("a fully completed workout is not labeled partial", () => {
  const sets = [1, 2, 3].map((n) =>
    set({ set_number: n, completed_at: "2026-09-08T10:00:00.000Z" }),
  );
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.isPartial, false);
  assert.equal(formatSetCompletionLabel(payload), "3 מתוך 3 סטים הושלמו");
});

test("duration, reps and volume are calculated deterministically", () => {
  const sets = [
    set({ exercise_id: EX_BENCH, set_number: 1, weight_kg: 30, reps: 12 }),
    set({ exercise_id: EX_BENCH, set_number: 2, weight_kg: 40, reps: 10 }),
    set({ exercise_id: EX_SQUAT, set_number: 1, weight_kg: 60, reps: 8 }),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.durationMinutes, 45);
  assert.equal(payload.totalReps, 30);
  assert.equal(payload.totalVolumeKg, 30 * 12 + 40 * 10 + 60 * 8);
});

test("warm-up sets count toward totals but are excluded from best-set and the breakdown", () => {
  const sets = [
    set({ exercise_id: EX_BENCH, set_number: 1, weight_kg: 20, reps: 15, is_warmup: true }),
    set({ exercise_id: EX_BENCH, set_number: 2, weight_kg: 50, reps: 8, is_warmup: false }),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  // Totals include the warm-up set.
  assert.equal(payload.totalReps, 15 + 8);
  assert.equal(payload.totalVolumeKg, 20 * 15 + 50 * 8);
  // Breakdown and best-set only see the working set.
  assert.equal(payload.exercises.length, 1);
  assert.equal(payload.exercises[0]!.sets.length, 1);
  assert.deepEqual(payload.bestSet, {
    exerciseName: "לחיצת חזה במכונה",
    weightKg: 50,
    reps: 8,
    volumeKg: 400,
  });
});

test("an exercise with only warm-up sets does not appear in the breakdown at all", () => {
  const sets = [set({ exercise_id: EX_BENCH, is_warmup: true })];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.exercises.length, 0);
  assert.equal(payload.bestSet, null);
  assert.equal(payload.primaryMuscleGroups.length, 0);
  // But it's still a completed set, so it still counts toward the totals.
  assert.equal(payload.completedSetCount, 1);
});

test("best-set selection is deterministic: highest volume wins, first occurrence breaks ties", () => {
  const sets = [
    set({ exercise_id: EX_BENCH, set_number: 1, weight_kg: 50, reps: 8 }), // 400
    set({ exercise_id: EX_SQUAT, set_number: 1, weight_kg: 40, reps: 10 }), // 400, tie
    set({ exercise_id: EX_CURL, set_number: 1, weight_kg: 60, reps: 8 }), // 480, wins
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(payload.bestSet?.exerciseName, "כפיפת מרפק");
  assert.equal(payload.bestSet?.volumeKg, 480);
});

test("no completed working sets → no best set, but never a crash", () => {
  const payload = buildWorkoutSharePayload(baseInput([]));
  assert.equal(payload.bestSet, null);
  assert.equal(payload.completedSetCount, 0);
  assert.equal(payload.plannedSetCount, 0);
});

test("exercise and set order is preserved exactly as given (position order)", () => {
  const sets = [
    set({ exercise_id: EX_SQUAT, set_number: 1 }),
    set({ exercise_id: EX_BENCH, set_number: 1 }),
    set({ exercise_id: EX_SQUAT, set_number: 2 }),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.deepEqual(
    payload.exercises.map((e) => e.name),
    ["סקוואט", "לחיצת חזה במכונה"],
  );
  assert.equal(payload.exercises[0]!.sets.length, 2);
});

test("the exercise breakdown line matches the exact spec format", () => {
  const sets = [
    set({ exercise_id: EX_BENCH, set_number: 1, weight_kg: 30, reps: 12 }),
    set({ exercise_id: EX_BENCH, set_number: 2, weight_kg: 40, reps: 12 }),
    set({ exercise_id: EX_BENCH, set_number: 3, weight_kg: 50, reps: 12 }),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.equal(
    formatExerciseSetLine(payload.exercises[0]!),
    "30 ק״ג × 12 · 40 ק״ג × 12 · 50 ק״ג × 12",
  );
});

test("primary muscle groups are deduplicated, in first-appearance order, skipping missing values", () => {
  const sets = [
    set({ exercise_id: EX_SQUAT, set_number: 1 }),
    set({ exercise_id: EX_BENCH, set_number: 1 }),
    set({ exercise_id: EX_SQUAT, set_number: 2 }),
  ];
  const payload = buildWorkoutSharePayload(baseInput(sets));
  assert.deepEqual(payload.primaryMuscleGroups, ["רגליים", "חזה"]);
});

test("zero values are never displayed as empty, and missing values are never invented", () => {
  const input = baseInput([]);
  input.session = { name: null, started_at: "2026-09-08T09:30:00.000Z", duration_seconds: null };
  const payload = buildWorkoutSharePayload(input);
  assert.equal(payload.workoutName, null);
  assert.equal(payload.durationMinutes, null);
  assert.equal(payload.totalReps, 0);
  assert.equal(payload.totalVolumeKg, 0);
});

test("coach section: only the AI narrative fields are accepted, sanitized and length-capped", () => {
  const input = baseInput([]);
  input.coach = {
    greeting: "אימון חזק היום!",
    paragraphs: ["פסקה ראשונה.", "פסקה שנייה."],
    highlights: ["שיא אישי"],
  };
  const payload = buildWorkoutSharePayload(input);
  assert.ok(payload.coachFull);
  assert.equal(payload.coachFull![0], "אימון חזק היום!");
  assert.deepEqual(payload.coachFull, ["אימון חזק היום!", "פסקה ראשונה.", "פסקה שנייה."]);
  assert.ok(payload.coachSummary);
});

test("coach summary (Codex review finding 6): greeting + up to 2 highlights, never the first paragraph", () => {
  const input = baseInput([]);
  input.coach = {
    greeting: "אימון חזק היום!",
    paragraphs: ["פסקה ראשונה שלא אמורה להופיע בתקציר.", "פסקה שנייה."],
    highlights: ["שיא אישי בסקוואט", "נפח שיא", "רצף אימונים"],
  };
  const payload = buildWorkoutSharePayload(input);
  assert.equal(payload.coachSummary, "אימון חזק היום! · שיא אישי בסקוואט · נפח שיא");
  assert.doesNotMatch(payload.coachSummary!, /פסקה ראשונה/);
  // The full narrative still has every paragraph, for the expanded view.
  assert.equal(payload.coachFull!.length, 3);
});

test("coach summary with no highlights falls back to the greeting alone", () => {
  const input = baseInput([]);
  input.coach = { greeting: "אימון חזק היום!", paragraphs: ["פסקה."], highlights: [] };
  const payload = buildWorkoutSharePayload(input);
  assert.equal(payload.coachSummary, "אימון חזק היום!");
});

test("coach section absent when disabled/unavailable — never blocks the rest of the payload", () => {
  const input = baseInput([set({})]);
  input.coach = null;
  const payload = buildWorkoutSharePayload(input);
  assert.equal(payload.coachSummary, null);
  assert.equal(payload.coachFull, null);
  assert.equal(payload.completedSetCount, 1);
});

test("caption and location are trimmed and length-capped, never trusted as-is", () => {
  const input = baseInput([]);
  input.caption = "  אימון מעולה  ";
  input.locationLabel = "  מכון הכושר שלי  ";
  const payload = buildWorkoutSharePayload(input);
  assert.equal(payload.caption, "אימון מעולה");
  assert.equal(payload.locationLabel, "מכון הכושר שלי");
});

test("no location by default — a null/empty locationLabel never appears in the payload", () => {
  const payload = buildWorkoutSharePayload(baseInput([]));
  assert.equal(payload.locationLabel, null);
});

test("payload never carries a raw error message, correlation id, or provider field — only the documented fields exist", () => {
  const payload = buildWorkoutSharePayload(baseInput([set({})]));
  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, [
    "bestSet",
    "caption",
    "coachFull",
    "coachSummary",
    "completedSetCount",
    "dateISO",
    "durationMinutes",
    "exercises",
    "isPartial",
    "locationLabel",
    "plannedSetCount",
    "primaryMuscleGroups",
    "totalReps",
    "totalVolumeKg",
    "version",
    "workoutName",
  ]);
});
