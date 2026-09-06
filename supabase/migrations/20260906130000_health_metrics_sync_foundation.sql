-- Extends the CORE-005 health_connections/health_metrics schema
-- (20260906000000_wearable_health_connections.sql) with what an automated
-- sync needs and manual entry didn't: idempotency for redelivered/replayed
-- samples, and an explicit opt-in separate from Advisor context consent.
--
-- Superseding note: an earlier, parallel PR built a second wearables schema
-- (user_wearable_connections/wearable_metrics/wearable_sync_preferences).
-- That PR was closed unmerged in favor of this one, single schema - do not
-- resurrect those table names.

alter table public.health_metrics
  add column external_id text,
  add column raw_source text;

-- Manual entries have no external_id and stay unconstrained (users can log
-- the same value twice on purpose). Only rows with an external_id - i.e.
-- from an automated sync - are deduplicated by it.
alter table public.health_metrics
  add constraint health_metrics_external_id_unique unique (user_id, source, external_id);

comment on column public.health_metrics.external_id is
  'Sync-provider sample id, for ON CONFLICT dedup on redelivery. Null for manual entries.';
comment on column public.health_metrics.raw_source is
  'Optional finer-grained origin within a provider (e.g. the underlying device brand behind Health Connect), for display only - source stays the enum an ingest/eligibility check keys on.';

alter table public.health_connections
  add column last_sync_error text;

create table public.health_sync_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_enabled boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_sync_preferences_consent_state_check check (
    (sync_enabled and consented_at is not null and revoked_at is null)
    or
    (not sync_enabled)
  )
);

alter table public.health_sync_preferences enable row level security;

create policy "Users read own health sync preference"
  on public.health_sync_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own health sync preference"
  on public.health_sync_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own health sync preference"
  on public.health_sync_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.health_sync_preferences from public, anon;
grant select, insert, update on public.health_sync_preferences to authenticated;
grant all on public.health_sync_preferences to service_role;

create trigger health_sync_preferences_touch
before update on public.health_sync_preferences
for each row execute function public.touch_updated_at();

comment on table public.health_sync_preferences is
  'Explicit opt-in for automated wearable sync. Manual entry needs no consent gate - only the ingest endpoint checks this.';
