-- CORE-005 / HEALTH-007: generic external health-data connector layer.
--
-- health_connections tracks which provider a user has linked (per provider,
-- since a future user may pair more than one — e.g. Health Connect + Garmin).
-- health_metrics stores the ingested samples themselves, provider-agnostic,
-- so the AI coach and readiness score (HEALTH-005) can read one shape
-- regardless of source. Health Connect / Garmin ingestion is native or
-- OAuth work that lands on top of this schema; "manual" is the only source
-- that writes rows today.

create table public.health_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('health_connect', 'garmin', 'apple_health', 'manual')),
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.health_connections enable row level security;

create policy "Users read own health connections"
  on public.health_connections for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own health connections"
  on public.health_connections for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own health connections"
  on public.health_connections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own health connections"
  on public.health_connections for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.health_connections from public, anon;
grant select, insert, update, delete on table public.health_connections to authenticated;
grant all on table public.health_connections to service_role;

create trigger health_connections_touch
  before update on public.health_connections
  for each row execute function public.touch_updated_at();

create table public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('health_connect', 'garmin', 'apple_health', 'manual')),
  metric_type text not null check (
    metric_type in ('heart_rate_resting', 'sleep_minutes', 'steps', 'calories_burned', 'workout_minutes')
  ),
  value numeric not null,
  unit text not null,
  recorded_at timestamptz not null,
  biological_day date not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

alter table public.health_metrics enable row level security;

create policy "Users read own health metrics"
  on public.health_metrics for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own health metrics"
  on public.health_metrics for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users delete own health metrics"
  on public.health_metrics for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.health_metrics from public, anon;
grant select, insert, delete on table public.health_metrics to authenticated;
grant all on table public.health_metrics to service_role;

create index health_metrics_user_day_idx
  on public.health_metrics (user_id, biological_day desc, metric_type);
