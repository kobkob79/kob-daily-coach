alter table public.community_posts
  add column if not exists author_avatar_path text;

drop policy if exists "Users create own community posts" on public.community_posts;

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

drop policy if exists "Users update own community posts" on public.community_posts;

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