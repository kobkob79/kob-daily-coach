import assert from "node:assert/strict";

import {
  CORE_150_EXERCISES,
  CORE_150_EXERCISE_NAMES,
  CORE_150_EXERCISE_NAME_SET,
  findCore150ExerciseByName,
  getCore150ExerciseByNumber,
} from "../src/lib/core-150-exercises.ts";

assert.equal(CORE_150_EXERCISES.length, 156, "catalog length");
assert.deepEqual(
  CORE_150_EXERCISES.map((exercise) => exercise.exerciseNumber),
  Array.from({ length: 156 }, (_, index) => index + 1),
  "exercise numbers",
);
assert.equal(
  new Set(CORE_150_EXERCISES.map((exercise) => exercise.canonicalHebrewName)).size,
  156,
  "unique canonical Hebrew names",
);
assert.ok(
  CORE_150_EXERCISES.every((exercise) => exercise.englishName.trim().length > 0),
  "non-empty English names",
);
assert.deepEqual(
  CORE_150_EXERCISE_NAMES,
  CORE_150_EXERCISES.map((exercise) => exercise.canonicalHebrewName),
  "derived names export",
);
assert.deepEqual(
  [...CORE_150_EXERCISE_NAME_SET],
  CORE_150_EXERCISE_NAMES,
  "derived name set export",
);

for (const exercise of CORE_150_EXERCISES) {
  assert.equal(getCore150ExerciseByNumber(exercise.exerciseNumber), exercise);
  assert.equal(findCore150ExerciseByName(exercise.canonicalHebrewName), exercise);
  assert.equal(findCore150ExerciseByName(exercise.englishName), exercise);
  assert.ok(exercise.aliases.includes(exercise.englishName), "English alias is required");
  for (const alias of exercise.aliases) {
    assert.equal(findCore150ExerciseByName(alias), exercise);
  }
}

assert.equal(findCore150ExerciseByName("  BARBELL BENCH PRESS ")?.exerciseNumber, 1);
assert.equal(findCore150ExerciseByName("לאנג׳ קדמי")?.exerciseNumber, 83);
assert.equal(findCore150ExerciseByName("תנועת חתול־פרה")?.exerciseNumber, 148);

console.log("Core 150 Naming Canon V2: PASS (156 exercises, no ambiguous names)");
