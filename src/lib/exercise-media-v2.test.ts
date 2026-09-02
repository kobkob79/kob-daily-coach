/**
 * Run with: node --test src/lib/exercise-media-v2.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMotionVideoStoragePath,
  DEFAULT_DEMONSTRATOR_KEY,
  DEMONSTRATOR_KEYS,
  isUuid,
  validateDetectedMotionVideoMetadata,
} from "./exercise-media-v2.ts";

const EXERCISE_ID = "10000000-0000-0000-0000-000000000001";
const VERSION_ID = "20000000-0000-0000-0000-000000000001";

test("isUuid accepts a well-formed UUID and rejects everything else", () => {
  assert.equal(isUuid(EXERCISE_ID), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("../../../etc/passwd"), false);
  assert.equal(isUuid(""), false);
});

test("buildMotionVideoStoragePath produces the recommended versioned shape and never collides with legacy roles", () => {
  const path = buildMotionVideoStoragePath(EXERCISE_ID, VERSION_ID);
  assert.equal(path, `exercises/${EXERCISE_ID}/v2/${VERSION_ID}/motion.mp4`);
  for (const legacy of ["thumbnail", "main", "guide", "demo"]) {
    assert.ok(!path.includes(`/${legacy}.`), `must not collide with legacy role "${legacy}"`);
  }
});

test("buildMotionVideoStoragePath with a replacement token produces a distinct path", () => {
  const original = buildMotionVideoStoragePath(EXERCISE_ID, VERSION_ID);
  const replacement = buildMotionVideoStoragePath(EXERCISE_ID, VERSION_ID, "abc123");
  assert.notEqual(original, replacement);
  assert.equal(replacement, `exercises/${EXERCISE_ID}/v2/${VERSION_ID}/motion.abc123.mp4`);
});

test("buildMotionVideoStoragePath rejects a malformed exerciseId or mediaVersionId (server-side path-component validation)", () => {
  assert.throws(() => buildMotionVideoStoragePath("../../etc", VERSION_ID));
  assert.throws(() => buildMotionVideoStoragePath(EXERCISE_ID, "../../etc"));
  assert.throws(() => buildMotionVideoStoragePath(EXERCISE_ID, VERSION_ID, "../escape"));
});

test("validateDetectedMotionVideoMetadata accepts an exactly-conforming file", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 2_000_000,
    width: 1280,
    height: 720,
    durationMs: 8000,
  });
  assert.deepEqual(errors, []);
});

test("validateDetectedMotionVideoMetadata rejects wrong mime type", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "video/webm",
    sizeBytes: 2_000_000,
    width: 1280,
    height: 720,
    durationMs: 8000,
  });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "invalid_mime_type");
});

test("validateDetectedMotionVideoMetadata rejects a file over 3 MiB", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 3_145_729,
    width: 1280,
    height: 720,
    durationMs: 8000,
  });
  assert.ok(errors.some((e) => e.code === "file_too_large"));
});

test("validateDetectedMotionVideoMetadata accepts exactly 3,145,728 bytes (the documented ceiling)", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 3_145_728,
    width: 1280,
    height: 720,
    durationMs: 8000,
  });
  assert.deepEqual(errors, []);
});

test("validateDetectedMotionVideoMetadata rejects any resolution other than 1280x720", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 2_000_000,
    width: 1920,
    height: 1080,
    durationMs: 8000,
  });
  assert.ok(errors.some((e) => e.code === "wrong_resolution"));
});

test("validateDetectedMotionVideoMetadata rejects duration below 6000ms and above 10000ms", () => {
  const tooShort = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 2_000_000,
    width: 1280,
    height: 720,
    durationMs: 5999,
  });
  const tooLong = validateDetectedMotionVideoMetadata({
    mimeType: "video/mp4",
    sizeBytes: 2_000_000,
    width: 1280,
    height: 720,
    durationMs: 10001,
  });
  assert.ok(tooShort.some((e) => e.code === "duration_out_of_range"));
  assert.ok(tooLong.some((e) => e.code === "duration_out_of_range"));
});

test("validateDetectedMotionVideoMetadata accepts the exact boundary durations 6000ms and 10000ms", () => {
  for (const durationMs of [6000, 10000]) {
    const errors = validateDetectedMotionVideoMetadata({
      mimeType: "video/mp4",
      sizeBytes: 2_000_000,
      width: 1280,
      height: 720,
      durationMs,
    });
    assert.deepEqual(errors, [], `boundary ${durationMs}ms should be accepted`);
  }
});

test("validateDetectedMotionVideoMetadata reports every violated rule at once", () => {
  const errors = validateDetectedMotionVideoMetadata({
    mimeType: "image/png",
    sizeBytes: 5_000_000,
    width: 640,
    height: 480,
    durationMs: 1000,
  });
  const codes = errors.map((e) => e.code).sort();
  assert.deepEqual(codes, [
    "duration_out_of_range",
    "file_too_large",
    "invalid_mime_type",
    "wrong_resolution",
  ]);
});

test("VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001: the only official V1 demonstrator is generic", () => {
  assert.deepEqual(DEMONSTRATOR_KEYS, ["generic"]);
  assert.equal(DEFAULT_DEMONSTRATOR_KEY, "generic");
  for (const superseded of ["daniel", "maya", "ortal"]) {
    assert.ok(
      !(DEMONSTRATOR_KEYS as readonly string[]).includes(superseded),
      `${superseded} must not be an accepted demonstrator key`,
    );
  }
});
