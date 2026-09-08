/**
 * Run with: node --test src/lib/community-workout-share-validation.test.ts
 *
 * Codex review finding 2 (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1): every
 * field of the publish/find server functions' input is strictly parsed,
 * not just cast — malformed input must be rejected before it ever reaches
 * a database call.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkoutSharePayload,
  publishInputSchema,
  sessionIdSchema,
} from "./community-workout-share-validation.ts";

const VALID_UUID = "33333333-3333-3333-3333-333333333333";
const VALID_PHOTO_PATH =
  "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: VALID_UUID,
    caption: null,
    photoPath: null,
    audience: "public",
    locationLabel: null,
    includeCoach: false,
    ...overrides,
  };
}

describe("publishInputSchema — valid input", () => {
  test("accepts a fully populated, valid request", () => {
    const result = publishInputSchema.safeParse(
      validInput({
        caption: "אימון מעולה",
        photoPath: VALID_PHOTO_PATH,
        audience: "followers",
        locationLabel: "מכון הכושר שלי",
        includeCoach: true,
      }),
    );
    assert.equal(result.success, true);
  });

  test("accepts nulls for every nullable field", () => {
    const result = publishInputSchema.safeParse(validInput());
    assert.equal(result.success, true);
  });
});

describe("publishInputSchema — rejects malformed input before any database access", () => {
  test("rejects a non-UUID sessionId", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ sessionId: "not-a-uuid" })).success,
      false,
    );
    assert.equal(publishInputSchema.safeParse(validInput({ sessionId: "" })).success, false);
    assert.equal(
      publishInputSchema.safeParse(
        validInput({
          sessionId: "33333333-3333-3333-3333-333333333333; drop table community_posts;",
        }),
      ).success,
      false,
    );
  });

  test("rejects a caption over the length cap", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ caption: "a".repeat(2001) })).success,
      false,
    );
  });

  test("rejects a caption containing control characters", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ caption: "hi\x00there" })).success,
      false,
    );
    assert.equal(
      publishInputSchema.safeParse(validInput({ caption: "hi\x1bthere" })).success,
      false,
    );
  });

  test("accepts a caption containing newlines (it's a multi-line Textarea)", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ caption: "line one\nline two" })).success,
      true,
    );
  });

  test("rejects a locationLabel containing a newline (single-line only)", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ locationLabel: "gym\nname" })).success,
      false,
    );
  });

  test("rejects a locationLabel over the length cap", () => {
    assert.equal(
      publishInputSchema.safeParse(validInput({ locationLabel: "a".repeat(121) })).success,
      false,
    );
  });

  test("rejects a photoPath that isn't a valid <uuid>/<uuid>.ext shape", () => {
    for (const bad of [
      "not-a-path",
      "../../etc/passwd",
      "11111111-1111-1111-1111-111111111111/../secret.jpg",
      "11111111-1111-1111-1111-111111111111/file.exe",
      "11111111-1111-1111-1111-111111111111/file", // no extension
    ]) {
      assert.equal(
        publishInputSchema.safeParse(validInput({ photoPath: bad })).success,
        false,
        `expected "${bad}" to be rejected`,
      );
    }
  });

  test("accepts every allowed photo extension", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const path = `11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.${ext}`;
      assert.equal(publishInputSchema.safeParse(validInput({ photoPath: path })).success, true);
    }
  });

  test("rejects an audience value outside the enum", () => {
    assert.equal(publishInputSchema.safeParse(validInput({ audience: "private" })).success, false);
    assert.equal(publishInputSchema.safeParse(validInput({ audience: "" })).success, false);
  });

  test("rejects a non-boolean includeCoach", () => {
    assert.equal(publishInputSchema.safeParse(validInput({ includeCoach: "true" })).success, false);
    assert.equal(publishInputSchema.safeParse(validInput({ includeCoach: 1 })).success, false);
  });

  test("rejects unknown/extra fields (no coach text field accepted anymore)", () => {
    assert.equal(
      publishInputSchema.safeParse(
        validInput({ coach: { greeting: "fake", paragraphs: [], highlights: [] } }),
      ).success,
      false,
    );
    assert.equal(publishInputSchema.safeParse(validInput({ userId: "spoofed" })).success, false);
  });

  test("rejects missing required fields, empty object, null, and non-object input", () => {
    assert.equal(publishInputSchema.safeParse({}).success, false);
    assert.equal(publishInputSchema.safeParse(null).success, false);
    assert.equal(publishInputSchema.safeParse(undefined).success, false);
    assert.equal(publishInputSchema.safeParse("a string").success, false);
    assert.equal(publishInputSchema.safeParse(validInput({ audience: undefined })).success, false);
  });
});

describe("sessionIdSchema", () => {
  test("accepts a valid UUID", () => {
    assert.equal(sessionIdSchema.safeParse({ sessionId: VALID_UUID }).success, true);
  });

  test("rejects a non-UUID or missing sessionId", () => {
    assert.equal(sessionIdSchema.safeParse({ sessionId: "not-a-uuid" }).success, false);
    assert.equal(sessionIdSchema.safeParse({}).success, false);
    assert.equal(sessionIdSchema.safeParse(null).success, false);
  });

  test("rejects extra fields", () => {
    assert.equal(sessionIdSchema.safeParse({ sessionId: VALID_UUID, extra: 1 }).success, false);
  });
});

describe("parseWorkoutSharePayload (Codex review finding 10)", () => {
  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      version: 1,
      workoutName: "דחיפה",
      dateISO: "2026-09-08T10:00:00.000Z",
      durationMinutes: 45,
      isPartial: false,
      completedSetCount: 12,
      plannedSetCount: 12,
      totalReps: 96,
      totalVolumeKg: 4820,
      bestSet: { exerciseName: "לחיצת חזה", weightKg: 80, reps: 6, volumeKg: 480 },
      primaryMuscleGroups: ["חזה", "כתפיים"],
      exercises: [{ name: "לחיצת חזה", sets: [{ weightKg: 80, reps: 6 }] }],
      coachSummary: "אימון מעולה",
      coachFull: ["אימון מעולה", "המשך כך"],
      caption: "היה כיף",
      locationLabel: "מכון הכושר שלי",
      ...overrides,
    };
  }

  test("accepts a well-formed payload, including every nullable field as null", () => {
    assert.notEqual(parseWorkoutSharePayload(validPayload()), null);
    assert.notEqual(
      parseWorkoutSharePayload(
        validPayload({
          workoutName: null,
          durationMinutes: null,
          bestSet: null,
          coachSummary: null,
          coachFull: null,
          caption: null,
          locationLabel: null,
        }),
      ),
      null,
    );
  });

  test("rejects an unknown/future payload version", () => {
    assert.equal(parseWorkoutSharePayload(validPayload({ version: 2 })), null);
    assert.equal(parseWorkoutSharePayload(validPayload({ version: "1" })), null);
  });

  test("rejects non-finite numbers anywhere numeric", () => {
    assert.equal(parseWorkoutSharePayload(validPayload({ totalVolumeKg: Infinity })), null);
    assert.equal(parseWorkoutSharePayload(validPayload({ totalReps: NaN })), null);
    assert.equal(
      parseWorkoutSharePayload(
        validPayload({ bestSet: { exerciseName: "x", weightKg: Infinity, reps: 6, volumeKg: 1 } }),
      ),
      null,
    );
    assert.equal(
      parseWorkoutSharePayload(
        validPayload({ exercises: [{ name: "x", sets: [{ weightKg: NaN, reps: 6 }] }] }),
      ),
      null,
    );
  });

  test("rejects a payload missing required fields", () => {
    const withoutVersion: Record<string, unknown> = validPayload();
    delete withoutVersion.version;
    assert.equal(parseWorkoutSharePayload(withoutVersion), null);
  });

  test("rejects unknown/extra top-level fields", () => {
    assert.equal(parseWorkoutSharePayload(validPayload({ coach: "spoofed" })), null);
  });

  test("rejects wrong types for array/object fields", () => {
    assert.equal(parseWorkoutSharePayload(validPayload({ exercises: "not-an-array" })), null);
    assert.equal(parseWorkoutSharePayload(validPayload({ primaryMuscleGroups: [1, 2] })), null);
    assert.equal(parseWorkoutSharePayload(validPayload({ bestSet: "not-an-object" })), null);
  });

  test("rejects null, undefined, a string, and an array as the whole payload", () => {
    assert.equal(parseWorkoutSharePayload(null), null);
    assert.equal(parseWorkoutSharePayload(undefined), null);
    assert.equal(parseWorkoutSharePayload("not a payload"), null);
    assert.equal(parseWorkoutSharePayload([]), null);
  });
});
