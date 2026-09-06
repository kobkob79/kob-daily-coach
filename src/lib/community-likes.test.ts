/**
 * Regression tests for community-likes.ts.
 * Run with: node --test src/lib/community-likes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getPostLikeState, summarizeLikes } from "./community-likes.ts";

const POST_A = "aaaaaaaa-0000-0000-0000-000000000000";
const POST_B = "bbbbbbbb-0000-0000-0000-000000000000";
const USER_ME = "11111111-0000-0000-0000-000000000000";
const USER_OTHER = "22222222-0000-0000-0000-000000000000";

test("summarizeLikes counts likes per post", () => {
  const summary = summarizeLikes(
    [
      { post_id: POST_A, user_id: USER_ME },
      { post_id: POST_A, user_id: USER_OTHER },
      { post_id: POST_B, user_id: USER_OTHER },
    ],
    USER_ME,
  );
  assert.deepEqual(getPostLikeState(summary, POST_A), { count: 2, likedByMe: true });
  assert.deepEqual(getPostLikeState(summary, POST_B), { count: 1, likedByMe: false });
});

test("getPostLikeState defaults to zero/not-liked for a post with no likes", () => {
  const summary = summarizeLikes([], USER_ME);
  assert.deepEqual(getPostLikeState(summary, POST_A), { count: 0, likedByMe: false });
});

test("summarizeLikes marks likedByMe false when no current user (logged out)", () => {
  const summary = summarizeLikes([{ post_id: POST_A, user_id: USER_OTHER }], undefined);
  assert.deepEqual(getPostLikeState(summary, POST_A), { count: 1, likedByMe: false });
});

test("summarizeLikes handles a post liked only by the current user", () => {
  const summary = summarizeLikes([{ post_id: POST_A, user_id: USER_ME }], USER_ME);
  assert.deepEqual(getPostLikeState(summary, POST_A), { count: 1, likedByMe: true });
});
