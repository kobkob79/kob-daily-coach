/**
 * Regression tests for community-posts.ts.
 * Run with: node --test src/lib/community-posts.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNITY_POST_MAX_BODY_LENGTH,
  communityAuthorInitials,
  validatePostDraft,
} from "./community-posts.ts";

test("validatePostDraft accepts body-only", () => {
  assert.deepEqual(validatePostDraft({ body: "האימון הראשון שלי!", hasPhoto: false }), {
    ok: true,
  });
});

test("validatePostDraft accepts photo-only with empty body", () => {
  assert.deepEqual(validatePostDraft({ body: "", hasPhoto: true }), { ok: true });
});

test("validatePostDraft rejects empty body with no photo", () => {
  const result = validatePostDraft({ body: "   ", hasPhoto: false });
  assert.equal(result.ok, false);
});

test("validatePostDraft rejects a body over the length cap even with a photo attached", () => {
  const result = validatePostDraft({
    body: "א".repeat(COMMUNITY_POST_MAX_BODY_LENGTH + 1),
    hasPhoto: true,
  });
  assert.equal(result.ok, false);
});

test("validatePostDraft accepts a body exactly at the length cap", () => {
  const result = validatePostDraft({
    body: "א".repeat(COMMUNITY_POST_MAX_BODY_LENGTH),
    hasPhoto: false,
  });
  assert.equal(result.ok, true);
});

test("communityAuthorInitials takes the first letter of up to two words", () => {
  assert.equal(communityAuthorInitials("קובי כהן"), "קכ");
  assert.equal(communityAuthorInitials("קובי"), "ק");
});

test("communityAuthorInitials handles blank/whitespace-only names", () => {
  assert.equal(communityAuthorInitials(""), "?");
  assert.equal(communityAuthorInitials("   "), "?");
});

test("communityAuthorInitials collapses extra whitespace between words", () => {
  assert.equal(communityAuthorInitials("  קובי    כהן  "), "קכ");
});
