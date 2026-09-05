-- Wearables integration foundation (Health Connect and similar providers).
-- Additive only: no existing table's behavior changes. Continuous samples
-- (heart rate, steps, ...) live in their own table rather than bloating
-- daily_events; daily_events gains provenance columns so a device-measured
-- weight/sleep row can be told apart from a user-entered one. Consent is a
-- dedicated opt-in, deliberately not folded into advisor_context_preferences.

create table public.user_wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_account_id text,
  status text not null default 'pending',
  scopes text[] not null default '{}'::text[],
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_wearable_connections_provider_not_blank check (btrim(provider) <> ''),
  constraint user_wearable_connections_status_check check (
    status in ('pending', 'connected', 'error', 'revoked')
  ),
  constraint user_wearable_connections_connected_at_check check (
    status <> 'connected' or connected_at is not null
  ),
  constraint user_wearable_connections_revoked_at_check check (
    status <> 'revoked' or revoked_at is not null
  ),
  constraint user_wearable_connections_user_provider_unique unique (user_id, provider)
);

create index user_wearable_connections_user_status_idx
  on public.user_wearable_connections (user_id, status);

create table public.wearable_sync_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_enabled boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  retain_data_on_disconnect boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wearable_sync_preferences_consent_state_check check (
    (sync_enabled and consented_at is not null and revoked_at is null)
    or
    (not sync_enabled)
  )
);

create table public.wearable_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.user_wearable_connections(id) on delete set null,
  bio_day_id uuid references public.bio_days(id) on delete set null,
  metric_type text not null,
  value numeric not null,
  unit text not null,
  occurred_at timestamptz not null,
  occurred_at_end timestamptz,
  external_source text not null,
  external_id text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wearable_metrics_type_check check (
    metric_type in (
      'heart_rate', 'resting_heart_rate', 'step_count', 'calories_active',
      'calories_resting', 'distance_meters', 'spo2', 'respiratory_rate'
    )
  ),
  constraint wearable_metrics_window_check check (
    occurred_at_end is null or occurred_at_end >= occurred_at
  ),
  constraint wearable_metrics_external_source_not_blank check (btrim(external_source) <> ''),
  constraint wearable_metrics_external_id_not_blank check (btrim(external_id) <> ''),
  -- Redelivered/overlapping sync windows resolve via ON CONFLICT (user_id,
  -- external_source, external_id) DO UPDATE at the ingest boundary.
  constraint wearable_metrics_source_unique unique (user_id, external_source, external_id)
);

create index wearable_metrics_user_bio_day_idx
  on public.wearable_metrics (user_id, bio_day_id);

create index wearable_metrics_user_type_time_idx
  on public.wearable_metrics (user_id, metric_type, occurred_at desc);

-- Provenance for device-attributed daily_events rows (e.g. watch-measured
-- sleep vs. a manually logged one). Null external_source means user-entered,
-- unchanged from today's behavior.
alter table public.daily_events
  add column external_source text,
  add column external_id text,
  add constraint daily_events_external_id_requires_source check (
    external_id is null or external_source is not null
  );

create unique index daily_events_external_source_unique
  on public.daily_events (user_id, external_source, external_id)
  where external_source is not null;

create trigger user_wearable_connections_touch
  before update on public.user_wearable_connections
  for each row execute function public.touch_updated_at();

create trigger wearable_sync_preferences_touch
  before update on public.wearable_sync_preferences
  for each row execute function public.touch_updated_at();

alter table public.user_wearable_connections enable row level security;
alter table public.wearable_sync_preferences enable row level security;
alter table public.wearable_metrics enable row level security;

revoke all on public.user_wearable_connections from public, anon;
revoke all on public.wearable_sync_preferences from public, anon;
revoke all on public.wearable_metrics from public, anon;

-- Token issuance and sync ingestion happen server-side with the service
-- role; clients only ever observe their own connection state.
grant select on public.user_wearable_connections to authenticated;
grant all on public.user_wearable_connections to service_role;

grant select, insert, update on public.wearable_sync_preferences to authenticated;
grant all on public.wearable_sync_preferences to service_role;

-- Metrics are device-measured facts: readable and purgeable by the owning
-- user (disconnect-and-delete), but only the ingest endpoint writes them.
grant select, delete on public.wearable_metrics to authenticated;
grant all on public.wearable_metrics to service_role;

create policy "Users read own wearable connections"
  on public.user_wearable_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own wearable sync preference"
  on public.wearable_sync_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own wearable sync preference"
  on public.wearable_sync_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own wearable sync preference"
  on public.wearable_sync_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read own wearable metrics"
  on public.wearable_metrics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users delete own wearable metrics"
  on public.wearable_metrics for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.user_wearable_connections is
  'OAuth/connection state per (user, provider). Tokens are app-layer ciphertext; server functions own writes.';
comment on table public.wearable_sync_preferences is
  'Explicit opt-in for wearable sync, kept separate from advisor context consent.';
comment on table public.wearable_metrics is
  'High-frequency device-measured samples (heart rate, steps, ...), attributed to a provider and bio day.';
