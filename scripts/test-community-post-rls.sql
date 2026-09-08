-- Run with (requires a local Postgres server, e.g. `service postgresql
-- start` if not already running — never point this at a remote/production
-- database, it drops and recreates a database named rls_proof):
--   psql -U postgres -f scripts/test-community-post-rls.sql
--
-- Minimal, self-contained schema mirroring the shipped RLS policies from
-- supabase/migrations/20260908150000_community_post_structured_types.sql,
-- for a local, throwaway Postgres instance — not a full replay of the
-- production migration history (that needs the real Supabase platform
-- schema: `auth`, `storage`, project-specific extensions). This proves the
-- POLICY LOGIC is correct, covering every scenario from Codex's round-2
-- re-review (blocker 7), not just the round-1 subset:
--
--  1. authenticated can create a 'regular' post.
--  2. authenticated cannot directly create a 'workout_result' post.
--  3. authenticated cannot turn a 'regular' post into a structured one via UPDATE.
--  4. authenticated cannot write/modify workout_debriefs at all.
--  5. the session owner can read their own workout_debriefs snapshot.
--  6. another user cannot read it.
--  7. a public post's photo is readable by any authenticated user.
--  8. a followers-only post's photo is readable by a follower.
--  9. a followers-only post's photo is blocked for a non-follower.
-- 10. the post owner can always read their own photo.
-- 11. the same audience rule applies to author_avatar_path.
-- 12. service_role (the trusted server path) can still write both tables.

drop database if exists rls_proof;
create database rls_proof;
\c rls_proof

create extension if not exists pgcrypto;

-- Minimal stand-in for Supabase's auth schema.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Supabase's real roles: `authenticated` is a normal RLS-bound role;
-- `service_role` has BYPASSRLS, exactly as Supabase configures it. Roles
-- are cluster-global (not dropped by `drop database`), so a prior run of
-- this script leaves them behind — create them only if missing, rather
-- than failing on a second run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
grant usage on schema public to authenticated, service_role;
grant usage on schema auth to authenticated, service_role;

create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id),
  followed_id uuid not null references auth.users(id)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  author_display_name text not null default 'x',
  author_avatar_path text,
  body text not null default '',
  photo_path text,
  post_type text not null default 'regular',
  payload jsonb,
  source_type text,
  source_id uuid,
  audience text not null default 'public',
  location_label text,
  constraint community_posts_post_type_valid
    check (post_type in ('regular', 'workout_result', 'meal_result', 'achievement')),
  constraint community_posts_audience_valid check (audience in ('public', 'followers')),
  constraint community_posts_structured_requires_source
    check (
      post_type = 'regular'
      or (source_type is not null and source_id is not null and payload is not null)
    )
);

alter table public.community_posts enable row level security;

-- The exact policies shipped in the migration.
create policy "Users create own regular community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and post_type = 'regular'
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (author_avatar_path is null or author_avatar_path like ((select auth.uid())::text || '/%'))
  );

create policy "Users update own regular community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = user_id and post_type = 'regular')
  with check (
    (select auth.uid()) = user_id
    and post_type = 'regular'
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (author_avatar_path is null or author_avatar_path like ((select auth.uid())::text || '/%'))
  );

create policy "Read own, public, or followed-author posts"
  on public.community_posts for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or audience = 'public'
    or (
      audience = 'followers'
      and exists (
        select 1 from public.user_follows
        where follower_id = (select auth.uid())
          and followed_id = community_posts.user_id
      )
    )
  );

grant select, insert, update on public.community_posts to authenticated;
grant all on public.community_posts to service_role;
grant select on public.user_follows to authenticated, service_role;
grant select, insert on public.workout_sessions to authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- workout_debriefs: the exact table + policies + ownership trigger shipped
-- in the migration (Codex re-review round 2, blockers 1+2).
create table public.workout_debriefs (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  greeting text not null,
  paragraphs text[] not null default '{}',
  highlights text[] not null default '{}'
);

alter table public.workout_debriefs enable row level security;

create policy "Users read own workout debriefs"
  on public.workout_debriefs for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.workout_debriefs from public;
revoke insert, update, delete on public.workout_debriefs from authenticated;
grant select on public.workout_debriefs to authenticated;
grant all on public.workout_debriefs to service_role;

create function public.workout_debriefs_verify_session_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workout_sessions
    where id = new.session_id and user_id = new.user_id
  ) then
    raise exception 'workout_debriefs.user_id must match workout_sessions.user_id for session_id %', new.session_id;
  end if;
  return new;
end;
$$;

create trigger workout_debriefs_verify_session_owner_trg
before insert or update of session_id, user_id on public.workout_debriefs
for each row execute function public.workout_debriefs_verify_session_owner();

-- Minimal stand-in for Supabase Storage's storage.objects, just the two
-- columns the shipped policy actually reads.
create schema storage;
grant usage on schema storage to authenticated, service_role;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;

create policy "Read community post photos per post audience"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'community-post-photos'
    and exists (
      select 1
      from public.community_posts p
      where (p.photo_path = storage.objects.name or p.author_avatar_path = storage.objects.name)
        and (
          p.user_id = (select auth.uid())
          or p.audience = 'public'
          or (
            p.audience = 'followers'
            and exists (
              select 1 from public.user_follows f
              where f.follower_id = (select auth.uid()) and f.followed_id = p.user_id
            )
          )
        )
    )
  );

grant select on storage.objects to authenticated;
grant all on storage.objects to service_role;

-- --- fixtures ---
-- U1 owns everything being read; U2 is an unrelated user with no
-- relationship to U1; U3 follows U1; U4 does not.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'), -- U1, the owner
  ('22222222-2222-2222-2222-222222222222'), -- U2, unrelated
  ('33333333-3333-3333-3333-333333333333'), -- U3, follows U1
  ('44444444-4444-4444-4444-444444444444'); -- U4, does not follow U1

insert into public.user_follows (follower_id, followed_id) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');

-- ============================================================
\echo '=== TEST 1: authenticated can create a regular post ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  insert into public.community_posts (user_id, post_type, body)
  values ('11111111-1111-1111-1111-111111111111', 'regular', 'hello');
  raise notice 'PASS: regular post insert succeeded';
end $$;

\echo '=== TEST 2: authenticated cannot directly create a workout_result post ==='
do $$
begin
  begin
    insert into public.community_posts
      (user_id, post_type, source_type, source_id, payload)
    values
      ('11111111-1111-1111-1111-111111111111', 'workout_result', 'workout',
       gen_random_uuid(), '{"version":1,"totalVolumeKg":999999,"forged":true}'::jsonb);
    raise exception 'FAIL: direct insert of workout_result was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: direct insert of workout_result rejected (insufficient_privilege)';
  end;
end $$;

\echo '=== TEST 2b: authenticated cannot insert a regular post for someone else ==='
do $$
begin
  begin
    insert into public.community_posts (user_id, post_type, body)
    values ('22222222-2222-2222-2222-222222222222', 'regular', 'spoofed');
    raise exception 'FAIL: inserting as another user was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: insert as another user rejected';
  end;
end $$;

\echo '=== TEST 3: authenticated cannot turn a regular post into a structured one via UPDATE ==='
do $$
declare
  regular_post_id uuid;
begin
  select id into regular_post_id from public.community_posts
    where user_id = '11111111-1111-1111-1111-111111111111' and post_type = 'regular'
    limit 1;
  begin
    update public.community_posts
      set post_type = 'workout_result', source_type = 'workout',
          source_id = gen_random_uuid(), payload = '{"version":1,"forged":true}'::jsonb
      where id = regular_post_id;
    raise exception 'FAIL: update to a structured post_type was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: update to a structured post_type rejected';
  end;
end $$;
reset role;

-- --- fixtures written by the trusted server path (service_role) ---
set role service_role;
insert into public.workout_sessions (id, user_id) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111');
insert into public.workout_debriefs (session_id, user_id, greeting, paragraphs, highlights) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111',
   'כל הכבוד', array['פסקה אמיתית'], array['שיא אמיתי']);
reset role;

\echo '=== TEST 4: authenticated cannot write/modify workout_debriefs at all ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  begin
    insert into public.workout_debriefs (session_id, user_id, greeting)
    values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'זיוף');
    raise exception 'FAIL: direct insert into workout_debriefs was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: direct insert into workout_debriefs rejected (insufficient_privilege)';
  end;
  begin
    update public.workout_debriefs set greeting = 'זיוף'
      where session_id = '55555555-5555-5555-5555-555555555555';
    raise exception 'FAIL: direct update of workout_debriefs was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: direct update of workout_debriefs rejected (insufficient_privilege)';
  end;
  begin
    delete from public.workout_debriefs where session_id = '55555555-5555-5555-5555-555555555555';
    raise exception 'FAIL: direct delete of workout_debriefs was NOT rejected';
  exception
    when insufficient_privilege then
      raise notice 'PASS: direct delete of workout_debriefs rejected (insufficient_privilege)';
  end;
end $$;

\echo '=== TEST 5: the session owner can read their own workout_debriefs snapshot ==='
do $$
declare
  found_count int;
begin
  select count(*) into found_count from public.workout_debriefs
    where session_id = '55555555-5555-5555-5555-555555555555';
  if found_count = 1 then
    raise notice 'PASS: owner reads their own snapshot (1 row)';
  else
    raise exception 'FAIL: expected 1 row for the owner, got %', found_count;
  end if;
end $$;
reset role;

\echo '=== TEST 6: another user cannot read it ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare
  found_count int;
begin
  select count(*) into found_count from public.workout_debriefs
    where session_id = '55555555-5555-5555-5555-555555555555';
  if found_count = 0 then
    raise notice 'PASS: another user reads 0 rows for someone else''s snapshot';
  else
    raise exception 'FAIL: expected 0 rows for a non-owner, got %', found_count;
  end if;
end $$;
reset role;

-- --- photo fixtures: a public post and a followers-only post, both
-- owned by U1, each with a photo_path and an author_avatar_path, plus
-- matching storage.objects rows ---
set role service_role;
insert into public.community_posts
  (id, user_id, post_type, body, photo_path, author_avatar_path, audience)
values
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111',
   'regular', 'public post',
   '11111111-1111-1111-1111-111111111111/public-photo.jpg',
   '11111111-1111-1111-1111-111111111111/public-avatar.jpg',
   'public'),
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
   'regular', 'followers-only post',
   '11111111-1111-1111-1111-111111111111/followers-photo.jpg',
   '11111111-1111-1111-1111-111111111111/followers-avatar.jpg',
   'followers');
insert into storage.objects (bucket_id, name) values
  ('community-post-photos', '11111111-1111-1111-1111-111111111111/public-photo.jpg'),
  ('community-post-photos', '11111111-1111-1111-1111-111111111111/public-avatar.jpg'),
  ('community-post-photos', '11111111-1111-1111-1111-111111111111/followers-photo.jpg'),
  ('community-post-photos', '11111111-1111-1111-1111-111111111111/followers-avatar.jpg');
reset role;

\echo '=== TEST 7: a public post''s photo is readable by any authenticated user ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false); -- U4, unrelated, non-follower
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/public-photo.jpg';
  if found_count = 1 then
    raise notice 'PASS: unrelated authenticated user reads a public post''s photo';
  else
    raise exception 'FAIL: expected the public photo to be readable, got % rows', found_count;
  end if;
end $$;

\echo '=== TEST 9: a followers-only post''s photo is blocked for a non-follower ==='
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/followers-photo.jpg';
  if found_count = 0 then
    raise notice 'PASS: non-follower reads 0 rows for a followers-only photo';
  else
    raise exception 'FAIL: expected the followers-only photo to be blocked, got % rows', found_count;
  end if;
end $$;

\echo '=== TEST 11a: a followers-only post''s AVATAR photo is also blocked for a non-follower ==='
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/followers-avatar.jpg';
  if found_count = 0 then
    raise notice 'PASS: non-follower reads 0 rows for a followers-only avatar';
  else
    raise exception 'FAIL: expected the followers-only avatar to be blocked, got % rows', found_count;
  end if;
end $$;
reset role;

\echo '=== TEST 8: a followers-only post''s photo IS readable by a follower ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- U3, follows U1
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/followers-photo.jpg';
  if found_count = 1 then
    raise notice 'PASS: a follower reads the followers-only post''s photo';
  else
    raise exception 'FAIL: expected the follower to read the photo, got % rows', found_count;
  end if;
end $$;

\echo '=== TEST 11b: the same audience rule allows a follower to read the AVATAR photo too ==='
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/followers-avatar.jpg';
  if found_count = 1 then
    raise notice 'PASS: a follower reads the followers-only post''s avatar';
  else
    raise exception 'FAIL: expected the follower to read the avatar, got % rows', found_count;
  end if;
end $$;
reset role;

\echo '=== TEST 10: the post owner can always read their own photo, any audience ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- U1, the owner
do $$
declare
  found_count int;
begin
  select count(*) into found_count from storage.objects
    where name in (
      '11111111-1111-1111-1111-111111111111/public-photo.jpg',
      '11111111-1111-1111-1111-111111111111/followers-photo.jpg'
    );
  if found_count = 2 then
    raise notice 'PASS: owner reads both their own public and followers-only photos';
  else
    raise exception 'FAIL: expected the owner to read both of their own photos, got % rows', found_count;
  end if;
end $$;
reset role;

\echo '=== TEST 12: service_role (the trusted server path) can still write both tables ==='
set role service_role;
do $$
declare
  new_session_id uuid;
begin
  insert into public.community_posts
    (user_id, post_type, source_type, source_id, payload)
  values
    ('11111111-1111-1111-1111-111111111111', 'workout_result', 'workout',
     gen_random_uuid(), '{"version":1,"totalVolumeKg":4820}'::jsonb);
  raise notice 'PASS: service_role insert of workout_result into community_posts succeeded';

  insert into public.workout_sessions (user_id) values ('11111111-1111-1111-1111-111111111111')
    returning id into new_session_id;
  insert into public.workout_debriefs (session_id, user_id, greeting)
  values (new_session_id, '11111111-1111-1111-1111-111111111111', 'נוצר על ידי השרת');
  raise notice 'PASS: service_role insert into workout_debriefs succeeded';
end $$;
reset role;

\echo '=== All RLS proof scenarios completed ==='
