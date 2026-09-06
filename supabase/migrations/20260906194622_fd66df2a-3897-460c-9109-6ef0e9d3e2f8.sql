create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null,
  body text not null default '',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_author_display_name_not_blank check (
    btrim(author_display_name) <> ''
  ),
  constraint community_posts_body_length check (char_length(body) <= 2000),
  constraint community_posts_has_content check (
    btrim(body) <> '' or photo_path is not null
  )
);

create index community_posts_created_at_idx on public.community_posts (created_at desc);
create index community_posts_user_idx on public.community_posts (user_id, created_at desc);

revoke all on public.community_posts from public, anon;
grant select, insert, update, delete on public.community_posts to authenticated;
grant all on public.community_posts to service_role;

alter table public.community_posts enable row level security;

create policy "Authenticated users read all community posts"
  on public.community_posts for select
  to authenticated
  using (true);

create policy "Users create own community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
  );

create policy "Users update own community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
  );

create policy "Users delete own community posts"
  on public.community_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger community_posts_touch
before update on public.community_posts
for each row execute function public.touch_updated_at();

create policy "Authenticated users read community post photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'community-post-photos');

create policy "Users upload own community post photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-post-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own community post photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'community-post-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'community-post-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own community post photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-post-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

comment on table public.community_posts is
  'Public-within-app feed posts. author_display_name is a point-in-time snapshot, not a live profile join.';