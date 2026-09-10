BEGIN;
select plan(21);

-- Create test users
select tests.create_supabase_user('user1');
select tests.create_supabase_user('user2');

-- 1. "anon" cannot read or write
-- To truly test anon, we clear auth and run.
select tests.clear_authentication();
-- Switch to a different role context using set_config if we could, but test.sql runs under postgres/service_role if auth is cleared in this framework.
-- Actually pgTAP 'anon' context requires explicit set_config('role', 'anon', true);
set local role anon;

select throws_ok(
  $$ select * from public.health_metrics $$,
  'permission denied for table health_metrics',
  'anon cannot read health_metrics'
);

-- Revert to original role (postgres/service_role)
reset role;

select tests.authenticate_as('user1');

-- 2. user can read only own metrics
insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day)
values (tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08');

select results_eq(
  $$ select user_id from public.health_metrics $$,
  $$ values (tests.get_supabase_uid('user1')) $$,
  'User 1 reads only own metrics'
);

-- 3. user cannot read other user's metrics
select tests.authenticate_as('user2');
select is_empty(
  $$ select * from public.health_metrics $$,
  'User 2 cannot read user 1 metrics'
);

-- 4. user can add manual metric
select tests.authenticate_as('user2');
select lives_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day) values (tests.get_supabase_uid('user2'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08') $$,
  'User 2 can create a manual metric'
);

-- 5. user cannot add manual metric for another user
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day) values (tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User 2 cannot create a metric for user 1'
);

-- 6. user cannot add health_connect
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user2'), 'health_connect', 'steps', 100, 'steps', now(), '2026-09-08', 'ext1') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User cannot create a health_connect metric'
);

-- 7. user cannot add garmin
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user2'), 'garmin', 'steps', 100, 'steps', now(), '2026-09-08', 'ext1') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User cannot create a garmin metric'
);

-- 8. user cannot add apple_health
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user2'), 'apple_health', 'steps', 100, 'steps', now(), '2026-09-08', 'ext1') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User cannot create an apple_health metric'
);

-- 9. manual with external_id rejected
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user2'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08', 'ext2') $$,
  'new row for relation "health_metrics" violates check constraint "health_metrics_manual_nulls"',
  'Manual metric with external_id is rejected'
);

-- 10. manual with raw_source rejected
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, raw_source) values (tests.get_supabase_uid('user2'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08', 'samsung') $$,
  'new row for relation "health_metrics" violates check constraint "health_metrics_manual_nulls"',
  'Manual metric with raw_source is rejected'
);

-- 11. authenticated lacks UPDATE on health_metrics
select throws_ok(
  $$ update public.health_metrics set value = 200 where user_id = tests.get_supabase_uid('user2') $$,
  'permission denied for table health_metrics',
  'authenticated has no UPDATE privilege on health_metrics'
);

-- 12. user can delete own metric
select lives_ok(
  $$ delete from public.health_metrics where user_id = tests.get_supabase_uid('user2') $$,
  'User can delete own metric'
);

-- 13. delete metric of other user affects 0 rows under RLS (doesn't throw, just deletes 0 rows)
select tests.authenticate_as('user2');
-- Insert a metric for user1 so we can attempt to delete it
select tests.authenticate_as('user1');
insert into public.health_metrics (id, user_id, source, metric_type, value, unit, recorded_at, biological_day)
values ('00000000-0000-0000-0000-000000000001', tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08');

select tests.authenticate_as('user2');
-- Should affect 0 rows, we'll verify it's still there
delete from public.health_metrics where id = '00000000-0000-0000-0000-000000000001';

select tests.authenticate_as('user1');
select results_eq(
  $$ select count(*)::int from public.health_metrics where id = '00000000-0000-0000-0000-000000000001' $$,
  $$ values (1::int) $$,
  'User 2 cannot delete User 1 metric (remains 1 row)'
);

-- 14. user can create manual connection
select tests.authenticate_as('user2');
select lives_ok(
  $$ insert into public.health_connections (user_id, provider) values (tests.get_supabase_uid('user2'), 'manual') $$,
  'User can create manual connection'
);

-- 15. user cannot create automated connection
select throws_ok(
  $$ insert into public.health_connections (user_id, provider) values (tests.get_supabase_uid('user2'), 'health_connect') $$,
  'new row violates row-level security policy for table "health_connections"',
  'User cannot create automated connection'
);

-- 16. user cannot change manual to health_connect
select throws_ok(
  $$ update public.health_connections set provider = 'health_connect' where user_id = tests.get_supabase_uid('user2') $$,
  'new row violates row-level security policy for table "health_connections"',
  'User cannot update manual to health_connect'
);

-- 17. user cannot change other user connection
select tests.authenticate_as('user1');
select throws_ok(
  $$ delete from public.health_connections where user_id = tests.get_supabase_uid('user2') $$,
  'new row violates row-level security policy for table "health_connections"',
  'User 1 cannot change user 2 connection'
);

-- 18. service_role can create automated metric
select tests.clear_authentication();
set local role service_role;

select lives_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user1'), 'health_connect', 'steps', 100, 'steps', now(), '2026-09-08', 'svc') $$,
  'service_role can create automated metric'
);

-- 19. service_role can create automated connection
select lives_ok(
  $$ insert into public.health_connections (user_id, provider) values (tests.get_supabase_uid('user1'), 'health_connect') $$,
  'service_role can create automated connection'
);

reset role;

select * from finish();
ROLLBACK;
