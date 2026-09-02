-- Scratch-database fixture for regression-testing
-- supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql in
-- isolation.
--
-- This repository has no Supabase CLI / local Supabase stack installed in
-- the sandbox this was authored in, so this fixture emulates just enough of
-- Supabase's platform schema for the migration under test to apply and
-- behave the same way it would on a real project:
--   - `auth.users` and `auth.uid()` (the RLS-relevant primitive)
--   - the `anon` / `authenticated` / `service_role` database roles
--   - a minimal `public.exercises` stand-in (only the PK the new FK needs)
--   - `public.touch_updated_at()`, copied verbatim from
--     supabase/migrations/20260703001150_ffc71b45-26a3-412b-84c9-7337b0372771.sql,
--     which the new migration assumes already exists.
--   - Supabase's own project bootstrap grants
--     `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
--     anon, authenticated, service_role;` so that, without any REVOKE, a
--     freshly `CREATE TABLE`d table in the public schema is immediately
--     readable/writable by anon and authenticated. This fixture reproduces
--     that default *before* the migration under test is applied, so the
--     migration's own REVOKE statements are proven to actually remove real
--     privileges rather than merely being tested against a database where
--     those privileges never existed.
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

-- Reproduce Supabase's own project bootstrap default privileges (see note
-- above) so tables created by the migration under test start out with the
-- same broad grants a real Supabase project would hand them, before that
-- migration's explicit REVOKE statements run.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
