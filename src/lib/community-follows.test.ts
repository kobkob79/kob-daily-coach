/**
 * Regression tests for community-follows.ts.
 * Run with: node --test src/lib/community-follows.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { followingSet } from "./community-follows.ts";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000000";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000000";

test("followingSet contains every followed id", () => {
  const set = followingSet([{ followed_id: USER_A }, { followed_id: USER_B }]);
  assert.equal(set.has(USER_A), true);
  assert.equal(set.has(USER_B), true);
});

test("followingSet is empty when there are no follows", () => {
  const set = followingSet([]);
  assert.equal(set.size, 0);
});

test("followingSet excludes ids that aren't followed", () => {
  const set = followingSet([{ followed_id: USER_A }]);
  assert.equal(set.has(USER_B), false);
});
