-- Community feed: likes. One like per user per post, toggled via
-- insert/delete rather than an update - there's nothing to update, a like
-- either exists or it doesn't.
--
-- Select is open to every authenticated user (using (true)), same as
-- community_posts itself: any signed-in user needs to see like counts and
-- "did I like this" state for any post in the shared feed, and a like row
-- carries no sensitive data (just who liked what, when).

create table public.community_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_post_likes_unique unique (post_id, user_id)
);

create index community_post_likes_post_idx on public.community_post_likes (post_id);
create index community_post_likes_user_idx on public.community_post_likes (user_id);

alter table public.community_post_likes enable row level security;

create policy "Authenticated users read all community post likes"
  on public.community_post_likes for select
  to authenticated
  using (true);

create policy "Users like posts as themselves"
  on public.community_post_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users unlike their own likes"
  on public.community_post_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.community_post_likes from public, anon;
grant select, insert, delete on public.community_post_likes to authenticated;
grant all on public.community_post_likes to service_role;

comment on table public.community_post_likes is
  'One row per (post, user) like. Toggled by insert/delete, no update path.';
