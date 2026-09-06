/**
 * Community feed likes — pure aggregation over the raw like rows fetched
 * for the currently-visible posts, no Supabase dependency so it's
 * unit-testable. The route component owns the actual read/write calls
 * (direct client + RLS, same shape as community-posts.ts).
 */

export interface LikeRow {
  post_id: string;
  user_id: string;
}

export interface PostLikeState {
  count: number;
  likedByMe: boolean;
}

/** Groups raw like rows (for however many posts are on screen) into a per-post count + "did I like this" flag. */
export function summarizeLikes(
  likes: readonly LikeRow[],
  currentUserId: string | undefined,
): Map<string, PostLikeState> {
  const summary = new Map<string, PostLikeState>();
  for (const like of likes) {
    const existing = summary.get(like.post_id) ?? { count: 0, likedByMe: false };
    existing.count += 1;
    if (currentUserId !== undefined && like.user_id === currentUserId) {
      existing.likedByMe = true;
    }
    summary.set(like.post_id, existing);
  }
  return summary;
}

/** Look up one post's like state, defaulting to zero/not-liked when it has no likes yet. */
export function getPostLikeState(
  summary: Map<string, PostLikeState>,
  postId: string,
): PostLikeState {
  return summary.get(postId) ?? { count: 0, likedByMe: false };
}
