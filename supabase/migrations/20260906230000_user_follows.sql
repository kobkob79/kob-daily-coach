-- Follow/unfollow between users, starting from the community feed (follow a
-- post's author straight off their post - there's no separate user directory
-- yet). One row per (follower, followed), toggled via insert/delete, same
-- shape as community_post_likes.
--
-- Select is open to every authenticated user: the row itself carries no
-- sensitive data (just who follows whom), and a follow state/count needs to
-- be visible across the app, not just to the two users involved.

create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_unique unique (follower_id, followed_id),
  constraint user_follows_no_self_follow check (follower_id <> followed_id)
);

create index user_follows_follower_idx on public.user_follows (follower_id);
create index user_follows_followed_idx on public.user_follows (followed_id);

alter table public.user_follows enable row level security;

create policy "Authenticated users read all follows"
  on public.user_follows for select
  to authenticated
  using (true);

create policy "Users follow others as themselves"
  on public.user_follows for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "Users unfollow as themselves"
  on public.user_follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

revoke all on public.user_follows from public, anon;
grant select, insert, delete on public.user_follows to authenticated;
grant all on public.user_follows to service_role;

comment on table public.user_follows is
  'One row per (follower, followed) relationship. Toggled by insert/delete, no update path. Self-follow blocked by a check constraint.';
