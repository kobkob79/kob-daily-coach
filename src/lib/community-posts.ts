/**
 * Community feed v1 — pure draft validation and display helpers, no
 * Supabase dependency so they're unit-testable. The route component owns
 * the actual read/write calls (direct client + RLS, same shape as
 * hydration.tsx/meals.tsx — no server function needed for owner-scoped CRUD
 * plus a public-within-app SELECT policy).
 */

export const COMMUNITY_POST_MAX_BODY_LENGTH = 2000;

export interface PostDraftInput {
  body: string;
  hasPhoto: boolean;
}

export type PostDraftValidation = { ok: true } | { ok: false; error: string };

/** Mirrors community_posts' two check constraints (has-content, body length) so a bad draft is caught before the round trip. */
export function validatePostDraft(input: PostDraftInput): PostDraftValidation {
  const trimmed = input.body.trim();
  if (!trimmed && !input.hasPhoto) {
    return { ok: false, error: "כתבו משהו או צרפו תמונה" };
  }
  // Count Unicode code points, not UTF-16 units — `body.length` counts surrogate
  // pairs (emoji, astral-plane characters) as 2, while Postgres' char_length
  // (the actual DB constraint) counts them as 1; matching it avoids rejecting
  // emoji-heavy posts the database would have accepted.
  if ([...input.body].length > COMMUNITY_POST_MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: `הפוסט ארוך מדי (עד ${COMMUNITY_POST_MAX_BODY_LENGTH} תווים)`,
    };
  }
  return { ok: true };
}

/** Up to two initials for the Avatar fallback — no avatar photo in v1 (see the migration's comment on why). */
export function communityAuthorInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return (first + second).toLocaleUpperCase("he-IL");
}
