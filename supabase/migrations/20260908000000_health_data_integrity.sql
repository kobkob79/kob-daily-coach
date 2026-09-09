-- Health Data Integrity PR 1
-- 1. authenticated role can only insert/update source = 'manual' for health_metrics.
-- 2. authenticated role can only insert/update provider = 'manual' for health_connections.
-- 3. Check constraint for health_metrics: if source = 'manual', external_id AND raw_source MUST be NULL.

-- Re-create health_metrics policies for authenticated to restrict source='manual'
drop policy if exists "Users create own health metrics" on public.health_metrics;
create policy "Users create own health metrics"
  on public.health_metrics for insert to authenticated
  with check ((select auth.uid()) = user_id and source = 'manual');

-- Add check constraint for manual entries
alter table public.health_metrics
  add constraint health_metrics_manual_nulls check (
    (source = 'manual' and external_id is null and raw_source is null) or
    (source != 'manual')
  );

-- Re-create health_connections policies for authenticated to restrict provider='manual'
drop policy if exists "Users create own health connections" on public.health_connections;
create policy "Users create own health connections"
  on public.health_connections for insert to authenticated
  with check ((select auth.uid()) = user_id and provider = 'manual');

drop policy if exists "Users update own health connections" on public.health_connections;
create policy "Users update own health connections"
  on public.health_connections for update to authenticated
  using ((select auth.uid()) = user_id and provider = 'manual')
  with check ((select auth.uid()) = user_id and provider = 'manual');

-- Re-create health_metrics policies for authenticated to restrict source='manual'
drop policy if exists "Users update own health metrics" on public.health_metrics;
create policy "Users update own health metrics"
  on public.health_metrics for update to authenticated
  using ((select auth.uid()) = user_id and source = 'manual')
  with check ((select auth.uid()) = user_id and source = 'manual');
