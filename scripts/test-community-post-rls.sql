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
-- POLICY LOGIC is correct (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1, Codex
-- review finding 1): a direct authenticated insert of a structured
-- (workout_result) post is rejected, a regular post insert still works,
-- a user cannot insert as another user, and the service-role publish path
-- still succeeds.

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
-- `service_role` has BYPASSRLS, exactly as Supabase configures it.
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to authenticated, service_role;
grant usage on schema auth to authenticated, service_role;

create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id),
  followed_id uuid not null references auth.users(id)
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

-- The exact policy shipped in the migration.
create policy "Users create own regular community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and post_type = 'regular'
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (author_avatar_path is null or author_avatar_path like ((select auth.uid())::text || '/%'))
  );

grant select, insert on public.community_posts to authenticated;
grant all on public.community_posts to service_role;
grant select on auth.users to authenticated, service_role;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');

\echo '=== TEST 1: authenticated user, direct insert of workout_result — must be REJECTED ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
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

\echo '=== TEST 2: authenticated user, direct insert of a regular post — must SUCCEED ==='
do $$
begin
  insert into public.community_posts (user_id, post_type, body)
  values ('11111111-1111-1111-1111-111111111111', 'regular', 'hello');
  raise notice 'PASS: regular post insert succeeded';
end $$;

\echo '=== TEST 3: authenticated user cannot insert a regular post for someone else ==='
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

reset role;

\echo '=== TEST 4: service_role (the publish path) CAN insert workout_result ==='
set role service_role;
do $$
begin
  insert into public.community_posts
    (user_id, post_type, source_type, source_id, payload)
  values
    ('11111111-1111-1111-1111-111111111111', 'workout_result', 'workout',
     gen_random_uuid(), '{"version":1,"totalVolumeKg":4820}'::jsonb);
  raise notice 'PASS: service_role insert of workout_result succeeded';
end $$;
reset role;

\echo '=== All RLS proof scenarios completed ==='
