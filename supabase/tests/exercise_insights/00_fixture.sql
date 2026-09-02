-- Minimal Supabase-compatible surface for a disposable PostgreSQL database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key
);

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.exercises (
  id uuid primary key default gen_random_uuid()
);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- Reproduce Supabase's legacy automatic-exposure defaults so privilege tests
-- prove that the migration's REVOKE statements do real work.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.exercises to authenticated, service_role;
