-- Scratch-database fixture for regression-testing
-- supabase/migrations/20260909120000_harden_exercise_assets_storage_rls.sql
-- in isolation, on top of the full real migration history it depends on.
--
-- Same rationale and technique as
-- supabase/tests/exercise_media_lifecycle/00_fixture.sql (no Supabase CLI /
-- local Supabase stack in this sandbox): emulate just enough of Supabase's
-- platform schema for the migrations under test to apply and behave the
-- same way they would on a real project. This fixture additionally emulates
-- `storage.objects` (bucket_id/name/owner/metadata - the columns the
-- exercise-assets policies actually reference) and Storage's own default
-- privilege grants to anon/authenticated/service_role, since
-- 00_fixture.sql in the sibling suite has no Storage surface at all.
--
-- Run only against a throwaway database created for this purpose - see
-- README.md in this directory for the exact commands used.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Reproduce Supabase's own project bootstrap default privileges so tables
-- created by the migrations under test start out with the same broad
-- grants a real Supabase project would hand them, before those migrations'
-- explicit REVOKE statements run - see the sibling suite's 00_fixture.sql
-- for the full rationale.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- ============================================================================
-- storage.objects emulation
-- ============================================================================
-- A real Supabase project ships the `storage` extension pre-installed, with
-- `storage.objects` already granted SELECT/INSERT/UPDATE/DELETE at the
-- table-privilege level to anon/authenticated/service_role - RLS policies
-- (not table-level REVOKE) are what actually restrict row visibility and
-- allowed operations there, and this repository's migrations have never
-- touched storage.objects's base grants, only its policies. Reproducing
-- the broad base grant here (rather than only granting SELECT) is what
-- makes assertion 7 in 01_assertions.sql a real proof: an INSERT/UPDATE/
-- DELETE attempt by `authenticated` is rejected by RLS with no matching
-- policy, not merely by a privilege that was never granted in the first
-- place. Only the columns the exercise-assets policies reference are
-- modeled: id, bucket_id, name, owner, metadata.

create schema if not exists storage;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
