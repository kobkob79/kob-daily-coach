-- ============================================================
-- 1) לייקים על פוסטים
-- ============================================================
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

-- ============================================================
-- 2) מעקב בין משתמשים (follow/unfollow)
-- ============================================================
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

-- ============================================================
-- 3) הודעות פרטיות 1:1
-- ============================================================
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_display_name text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_display_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id),
  constraint direct_messages_body_not_blank check (btrim(body) <> ''),
  constraint direct_messages_body_length check (char_length(body) <= 2000),
  constraint direct_messages_sender_name_not_blank check (btrim(sender_display_name) <> ''),
  constraint direct_messages_recipient_name_not_blank check (btrim(recipient_display_name) <> '')
);

create index direct_messages_sender_idx on public.direct_messages (sender_id, created_at desc);
create index direct_messages_recipient_idx on public.direct_messages (recipient_id, created_at desc);
create index direct_messages_pair_idx
  on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

alter table public.direct_messages enable row level security;

create policy "Participants read their own direct messages"
  on public.direct_messages for select
  to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

create policy "Users send direct messages as themselves"
  on public.direct_messages for insert
  to authenticated
  with check ((select auth.uid()) = sender_id);

create policy "Senders retract their own direct messages"
  on public.direct_messages for delete
  to authenticated
  using ((select auth.uid()) = sender_id);

revoke all on public.direct_messages from public, anon;
grant select, insert, delete on public.direct_messages to authenticated;
grant all on public.direct_messages to service_role;

comment on table public.direct_messages is
  '1:1 private messages. sender_display_name/recipient_display_name are point-in-time snapshots, not a live profiles join. No update path - only the sender can delete (retract) their own message.';