BEGIN;
select plan(11);

-- Create test users
select tests.create_supabase_user('user1');
select tests.create_supabase_user('user2');
declare uid1 uuid := tests.get_supabase_uid('user1');
declare uid2 uuid := tests.get_supabase_uid('user2');

-- Authenticate as user1
select tests.authenticate_as('user1');

-- 1. user1 can create manual metric
select lives_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day) values (tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08') $$,
  'User 1 can create a manual metric'
);

-- 2. user1 cannot create health_connect metric
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user1'), 'health_connect', 'steps', 100, 'steps', now(), '2026-09-08', 'ext1') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User 1 cannot create a health_connect metric'
);

-- 3. user1 cannot create metric for user2
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day) values (tests.get_supabase_uid('user2'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08') $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User 1 cannot create a metric for user 2'
);

-- 4. manual record with external_id is rejected
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08', 'ext2') $$,
  'new row for relation "health_metrics" violates check constraint "health_metrics_manual_nulls"',
  'Manual metric with external_id is rejected'
);

-- 5. manual record with raw_source is rejected
select throws_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, raw_source) values (tests.get_supabase_uid('user1'), 'manual', 'steps', 100, 'steps', now(), '2026-09-08', 'samsung') $$,
  'new row for relation "health_metrics" violates check constraint "health_metrics_manual_nulls"',
  'Manual metric with raw_source is rejected'
);

-- 6. user1 cannot create health_connect connection
select throws_ok(
  $$ insert into public.health_connections (user_id, provider) values (tests.get_supabase_uid('user1'), 'health_connect') $$,
  'new row violates row-level security policy for table "health_connections"',
  'User 1 cannot create a health_connect connection'
);

-- 7. user1 cannot update a manual connection to health_connect
insert into public.health_connections (user_id, provider) values (uid1, 'manual');
select throws_ok(
  $$ update public.health_connections set provider = 'health_connect' where user_id = tests.get_supabase_uid('user1') and provider = 'manual' $$,
  'new row violates row-level security policy for table "health_connections"',
  'User 1 cannot change provider to health_connect'
);

-- 8. Service role can write automatic source (clear auth first)
select tests.clear_authentication();
select lives_ok(
  $$ insert into public.health_metrics (user_id, source, metric_type, value, unit, recorded_at, biological_day, external_id) values (tests.get_supabase_uid('user1'), 'health_connect', 'steps', 100, 'steps', now(), '2026-09-08', 'ext-svc') $$,
  'Service role can create health_connect metrics'
);

-- 9. User 2 cannot read user 1 metrics
select tests.authenticate_as('user2');
select is_empty(
  $$ select * from public.health_metrics where user_id = tests.get_supabase_uid('user1') $$,
  'User 2 cannot read user 1 metrics'
);

-- 10. User 1 can delete own manual metric
select tests.authenticate_as('user1');
select lives_ok(
  $$ delete from public.health_metrics where user_id = tests.get_supabase_uid('user1') and source = 'manual' $$,
  'User 1 can delete own manual metrics'
);

-- 11. User 1 cannot update manual metric source to health_connect
select tests.authenticate_as('user1');
select throws_ok(
  $$ update public.health_metrics set source = 'health_connect' where user_id = tests.get_supabase_uid('user1') and source = 'manual' $$,
  'new row violates row-level security policy for table "health_metrics"',
  'User 1 cannot update source to health_connect'
);

select * from finish();
ROLLBACK;
