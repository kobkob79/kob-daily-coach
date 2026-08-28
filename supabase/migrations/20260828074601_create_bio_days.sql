-- Canonical biological-day identity. Existing domain rows remain untouched;
-- assignments are a forward-only overlay that preserves source provenance.

create table public.bio_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  local_date date not null,
  source text not null,
  status text not null default 'open',
  boundary_metadata jsonb not null default '{}'::jsonb,
  correction_metadata jsonb,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bio_days_timezone_not_blank check (btrim(timezone) <> ''),
  constraint bio_days_source_check check (
    source in ('explicit', 'shift_inferred', 'schedule_inferred', 'legacy_fallback', 'manual_correction')
  ),
  constraint bio_days_status_check check (status in ('open', 'closed', 'corrected')),
  constraint bio_days_time_range_check check (ends_at is null or ends_at > starts_at),
  constraint bio_days_open_end_check check (status <> 'open' or ends_at is null),
  constraint bio_days_closed_end_check check (status = 'open' or ends_at is not null),
  constraint bio_days_correction_audit_check check (
    source <> 'manual_correction'
    or (correction_metadata is not null and corrected_at is not null)
  )
);

create unique index bio_days_one_open_per_user
  on public.bio_days (user_id)
  where status = 'open';

create index bio_days_user_starts_at_idx
  on public.bio_days (user_id, starts_at desc);

create index bio_days_user_time_range_idx
  on public.bio_days (user_id, starts_at, ends_at);

create index bio_days_user_local_date_idx
  on public.bio_days (user_id, local_date desc);

create table public.bio_day_event_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bio_day_id uuid not null references public.bio_days(id) on delete cascade,
  source_domain text not null,
  source_table text not null,
  source_record_id uuid not null,
  source text not null,
  assignment_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bio_day_assignments_domain_not_blank check (btrim(source_domain) <> ''),
  constraint bio_day_assignments_table_check check (
    source_table in (
      'nutrition_entries', 'daily_events', 'workout_instances',
      'workout_sessions', 'workouts', 'health_logs'
    )
  ),
  constraint bio_day_assignments_source_check check (
    source in ('timestamp_resolved', 'legacy_adapted', 'manual_correction', 'imported')
  ),
  constraint bio_day_assignments_source_unique
    unique (user_id, source_table, source_record_id)
);

create index bio_day_assignments_bio_day_idx
  on public.bio_day_event_assignments (user_id, bio_day_id);

create or replace function public.prevent_bio_day_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'bio day ownership cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.validate_bio_day_assignment_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bio_days day
    where day.id = new.bio_day_id
      and day.user_id = new.user_id
  ) then
    raise exception 'bio day assignment ownership mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.validate_bio_day_assignment_source_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_is_owned boolean := false;
begin
  case new.source_table
    when 'nutrition_entries' then
      select exists (select 1 from public.nutrition_entries where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    when 'daily_events' then
      select exists (select 1 from public.daily_events where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    when 'workout_instances' then
      select exists (select 1 from public.workout_instances where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    when 'workout_sessions' then
      select exists (select 1 from public.workout_sessions where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    when 'workouts' then
      select exists (select 1 from public.workouts where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    when 'health_logs' then
      select exists (select 1 from public.health_logs where id = new.source_record_id and user_id = new.user_id) into source_is_owned;
    else
      source_is_owned := false;
  end case;

  if not source_is_owned then
    raise exception 'bio day assignment source ownership mismatch';
  end if;
  return new;
end;
$$;

create trigger bio_days_prevent_owner_change
before update on public.bio_days
for each row execute function public.prevent_bio_day_owner_change();

create trigger bio_day_assignments_prevent_owner_change
before update on public.bio_day_event_assignments
for each row execute function public.prevent_bio_day_owner_change();

create trigger bio_day_assignments_validate_owner
before insert or update on public.bio_day_event_assignments
for each row execute function public.validate_bio_day_assignment_owner();

create trigger bio_day_assignments_validate_source_owner
before insert or update on public.bio_day_event_assignments
for each row execute function public.validate_bio_day_assignment_source_owner();

create trigger bio_days_updated_at
before update on public.bio_days
for each row execute function public.touch_updated_at();

create trigger bio_day_assignments_updated_at
before update on public.bio_day_event_assignments
for each row execute function public.touch_updated_at();

alter table public.bio_days enable row level security;
alter table public.bio_day_event_assignments enable row level security;

revoke all on public.bio_days from public, anon;
revoke all on public.bio_day_event_assignments from public, anon;
grant select, insert, update on public.bio_days to authenticated;
grant select, insert, update, delete on public.bio_day_event_assignments to authenticated;
grant all on public.bio_days to service_role;
grant all on public.bio_day_event_assignments to service_role;

create policy "Users read own bio days"
on public.bio_days for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create own bio days"
on public.bio_days for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update own bio days"
on public.bio_days for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users read own bio day assignments"
on public.bio_day_event_assignments for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create own bio day assignments"
on public.bio_day_event_assignments for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update own bio day assignments"
on public.bio_day_event_assignments for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users delete own bio day assignments"
on public.bio_day_event_assignments for delete
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.bio_days is
  'Canonical, timezone-recorded biological-day boundaries. Existing domain rows remain factual sources.';
comment on table public.bio_day_event_assignments is
  'Auditable overlay assigning existing domain records to canonical biological days without copying facts.';
