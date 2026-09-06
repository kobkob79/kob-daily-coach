/**
 * Follow/unfollow — pure helper over the current user's own follow rows, no
 * Supabase dependency so it's unit-testable. The route component owns the
 * actual read/write calls (direct client + RLS, same shape as
 * community-likes.ts).
 *
 * Unlike likes, the UI never needs a total follower count for someone else's
 * account here (there's no profile page yet, just a follow button on posts) -
 * it only needs "am I already following this post's author", so the query is
 * scoped to the current user's own outgoing follows in the first place.
 */

export interface FollowRow {
  followed_id: string;
}

/** Turns the current user's own follow rows into a lookup set for "am I following this user id". */
export function followingSet(follows: readonly FollowRow[]): Set<string> {
  return new Set(follows.map((f) => f.followed_id));
}
