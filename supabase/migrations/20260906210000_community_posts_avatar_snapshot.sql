-- Community feed: avatar snapshot, closing the gap left in
-- 20260906120000_community_posts.sql's comment ("a generic initial is shown
-- instead"). Same reasoning as author_display_name: profile-photos is
-- owner-scoped storage (only the owner can read their own avatar), so
-- rather than open that up for cross-user reads, the post copies the
-- author's avatar image into the already-public community-post-photos
-- bucket at post time and remembers where it put it. Later avatar changes
-- don't affect posts already published, same as the display name.

alter table public.community_posts
  add column author_avatar_path text;

-- Same anti-spoofing shape as photo_path: must sit in the caller's own
-- upload folder in community-post-photos, or be absent.
drop policy "Users create own community posts" on public.community_posts;
create policy "Users create own community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (
      author_avatar_path is null
      or author_avatar_path like ((select auth.uid())::text || '/%')
    )
  );

drop policy "Users update own community posts" on public.community_posts;
create policy "Users update own community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (
      author_avatar_path is null
      or author_avatar_path like ((select auth.uid())::text || '/%')
    )
  );

comment on column public.community_posts.author_avatar_path is
  'Point-in-time copy of the author''s avatar in community-post-photos, not a live profile join. Null if the author had no avatar at post time.';
