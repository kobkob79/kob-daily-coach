-- Regression assertions for
-- supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql
--
-- Run with `psql -v ON_ERROR_STOP=1` against a scratch database that already
-- has 00_fixture.sql and the migration applied (see README.md). Each block
-- below is a self-contained PL/pgSQL DO statement that either raises a
-- clearly labelled exception (an actual failure) or prints
-- `NOTICE: PASS: <name>`. A clean run to completion is the test result.

-- ---------------------------------------------------------------------------
-- Shared fixture data used by the tests below.
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), -- creator / QA reviewer
  ('00000000-0000-0000-0000-000000000002'); -- publisher

insert into public.exercises (id) values
  ('10000000-0000-0000-0000-000000000001'), -- exercise A
  ('10000000-0000-0000-0000-000000000002'), -- exercise B (mutation-denial / trash tests)
  ('10000000-0000-0000-0000-000000000003'), -- exercise C (QA-gating tests)
  ('10000000-0000-0000-0000-000000000004'); -- exercise D (restrictive-deletion cascade test)

-- ---------------------------------------------------------------------------
-- 1. Allowed and rejected lifecycle statuses.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.exercise_media_versions
    (id, exercise_id, version_number, demonstrator_key, status, created_by)
  values
    ('20000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001', 1, 'daniel', 'draft',
     '00000000-0000-0000-0000-000000000001');

  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000001', 99, 'daniel', 'bogus_status',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: an invalid status value was accepted';
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 1. allowed/rejected lifecycle statuses';
end $$;

-- ---------------------------------------------------------------------------
-- 2. `ortal` must not be an accepted demonstrator.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000001', 98, 'ortal', 'draft',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: demonstrator_key = ortal was accepted';
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 2. ortal rejected as demonstrator_key';
end $$;

-- ---------------------------------------------------------------------------
-- 3. At most one active Draft/working version per exercise.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000001', 2, 'maya', 'media_ready',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: a second active working version was accepted';
  exception
    when unique_violation then null; -- expected
  end;

  raise notice 'PASS: 3. one active working version per exercise';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Take the first version through QA (required before Published), publish
--    it, then verify only one Published version per exercise is allowed,
--    and that publishing frees up the "active working" slot for a new
--    Draft (a new Draft never displaces Published; they are simply
--    different, coexisting rows once the old one leaves the working-state
--    set).
-- ---------------------------------------------------------------------------
do $$
begin
  update public.exercise_media_versions
  set status = 'qa_passed',
      qa_reviewed_by = '00000000-0000-0000-0000-000000000001',
      qa_reviewed_at = now()
  where id = '20000000-0000-0000-0000-000000000001';

  update public.exercise_media_versions
  set status = 'published',
      published_by = '00000000-0000-0000-0000-000000000002',
      published_at = now()
  where id = '20000000-0000-0000-0000-000000000001';

  -- A second Draft can now be created (the working-slot is free again).
  insert into public.exercise_media_versions
    (id, exercise_id, version_number, demonstrator_key, status, created_by)
  values
    ('20000000-0000-0000-0000-000000000002',
     '10000000-0000-0000-0000-000000000001', 2, 'maya', 'draft',
     '00000000-0000-0000-0000-000000000001');

  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by,
       qa_reviewed_by, qa_reviewed_at, published_by, published_at)
    values
      ('10000000-0000-0000-0000-000000000001', 3, 'daniel', 'published',
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000001', now(),
       '00000000-0000-0000-0000-000000000002', now());
    raise exception 'TEST FAILED: a second Published version was accepted';
  exception
    when unique_violation then null; -- expected
  end;

  raise notice 'PASS: 4. one Published version per exercise (via a required QA pass); new Draft does not displace it';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Published/QA/Rejected field-consistency CHECKs.
-- ---------------------------------------------------------------------------
do $$
begin
  -- status = 'published' without published_by/published_at must fail.
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000002', 1, 'daniel', 'published',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: published without published_by/at was accepted';
  exception
    when check_violation then null; -- expected
  end;

  -- status = 'rejected' without rejected_by/rejected_at must fail.
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000002', 1, 'daniel', 'rejected',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: rejected without rejected_by/at was accepted';
  exception
    when check_violation then null; -- expected
  end;

  -- qa_reviewed_by without qa_reviewed_at must fail.
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by, qa_reviewed_by)
    values
      ('10000000-0000-0000-0000-000000000002', 1, 'daniel', 'draft',
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: partial QA fields were accepted';
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 5. published/QA/rejected field consistency';
end $$;

-- ---------------------------------------------------------------------------
-- 5b. Publishing requires QA approval: qa_reviewed_by/qa_reviewed_at must
--     already be set before a row can reach qa_passed, and therefore before
--     it can reach published.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Published, with published_by/at set, but no QA review at all: must fail.
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by,
       published_by, published_at)
    values
      ('10000000-0000-0000-0000-000000000003', 1, 'daniel', 'published',
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000002', now());
    raise exception 'TEST FAILED: Published without a QA review was accepted';
  exception
    when check_violation then null; -- expected
  end;

  -- QA Passed without qa_reviewed_by/qa_reviewed_at: must fail.
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000003', 1, 'daniel', 'qa_passed',
       '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: QA Passed without QA review metadata was accepted';
  exception
    when check_violation then null; -- expected
  end;

  -- Positive control: QA Passed WITH a completed review succeeds.
  insert into public.exercise_media_versions
    (exercise_id, version_number, demonstrator_key, status, created_by,
     qa_reviewed_by, qa_reviewed_at)
  values
    ('10000000-0000-0000-0000-000000000003', 1, 'daniel', 'qa_passed',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000001', now());

  raise notice 'PASS: 5b. Published/QA Passed require a completed QA review beforehand';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Trash retention default (30 days) is applied by the trigger, and the
--    trash_state CHECK cannot be bypassed with a half-populated row.
-- ---------------------------------------------------------------------------
do $$
declare
  v_trashed timestamptz;
  v_purge timestamptz;
begin
  insert into public.exercise_media_versions
    (id, exercise_id, version_number, demonstrator_key, status, created_by)
  values
    ('20000000-0000-0000-0000-000000000003',
     '10000000-0000-0000-0000-000000000002', 2, 'maya', 'trash',
     '00000000-0000-0000-0000-000000000001')
  returning trashed_at, purge_after into v_trashed, v_purge;

  if v_trashed is null or v_purge is null then
    raise exception 'TEST FAILED: trash defaults were not applied';
  end if;

  if abs(extract(epoch from (v_purge - v_trashed)) - 30 * 86400) > 5 then
    raise exception 'TEST FAILED: purge_after is not ~30 days after trashed_at (got % / %)',
      v_trashed, v_purge;
  end if;

  raise notice 'PASS: 6. trash retention defaults to 30 days';
end $$;

-- ---------------------------------------------------------------------------
-- 6b. purge_after can never be scheduled earlier than trashed_at.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by,
       trashed_at, purge_after)
    values
      ('10000000-0000-0000-0000-000000000002', 3, 'maya', 'trash',
       '00000000-0000-0000-0000-000000000001',
       now(), now() - interval '1 day');
    raise exception 'TEST FAILED: purge_after earlier than trashed_at was accepted';
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 6b. purge_after cannot precede trashed_at';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Media assets: unique role per version, and MP4 metadata limits.
-- ---------------------------------------------------------------------------
do $$
begin
  -- A conforming motion_video asset succeeds.
  insert into public.exercise_media_assets
    (id, media_version_id, role, storage_path, mime_type,
     file_size_bytes, width, height, duration_ms, frame_rate)
  values
    ('30000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001', 'motion_video',
     'exercises/e1/versions/v1/motion.mp4', 'video/mp4',
     2000000, 1280, 720, 8000, 30);

  -- A second asset with the same role on the same version must fail.
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('20000000-0000-0000-0000-000000000001', 'motion_video',
       'exercises/e1/versions/v1/motion-2.mp4', 'video/mp4',
       2000000, 1280, 720, 8000, 30);
    raise exception 'TEST FAILED: duplicate role on one version was accepted';
  exception
    when unique_violation then null; -- expected
  end;

  raise notice 'PASS: 7. one asset per role per version';
end $$;

do $$
declare
  v_case text;
begin
  -- Oversized file.
  v_case := 'oversized file_size_bytes';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('20000000-0000-0000-0000-000000000002', 'motion_video',
       'exercises/e1/versions/v2/motion.mp4', 'video/mp4',
       3145729, 1280, 720, 8000, 30);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  -- Duration outside 6000-10000ms.
  v_case := 'duration out of range';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('20000000-0000-0000-0000-000000000002', 'motion_video',
       'exercises/e1/versions/v2/motion.mp4', 'video/mp4',
       2000000, 1280, 720, 11000, 30);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  -- Wrong resolution.
  v_case := 'wrong resolution';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('20000000-0000-0000-0000-000000000002', 'motion_video',
       'exercises/e1/versions/v2/motion.mp4', 'video/mp4',
       2000000, 1920, 1080, 8000, 30);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  -- Wrong mime type for motion_video.
  v_case := 'wrong motion_video mime type';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('20000000-0000-0000-0000-000000000002', 'motion_video',
       'exercises/e1/versions/v2/motion.webm', 'video/webm',
       2000000, 1280, 720, 8000, 30);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  -- Missing width/height/frame_rate (NULL) must NOT silently satisfy the
  -- CHECK (this is the specific NULL-semantics pitfall the migration's
  -- comments call out).
  v_case := 'missing width/height/frame_rate (NULL)';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes, duration_ms)
    values
      ('20000000-0000-0000-0000-000000000002', 'motion_video',
       'exercises/e1/versions/v2/motion.mp4', 'video/mp4',
       2000000, 8000);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  -- Hero cover with a disallowed mime type.
  v_case := 'disallowed hero_cover mime type';
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes)
    values
      ('20000000-0000-0000-0000-000000000002', 'hero_cover',
       'exercises/e1/versions/v2/hero.gif', 'image/gif', 400000);
    raise exception 'TEST FAILED: % was accepted', v_case;
  exception
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 8. MP4/hero metadata limits enforced (5 sub-cases)';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Published-only visibility for `authenticated` on both media tables.
-- ---------------------------------------------------------------------------
do $$
declare
  v_versions_seen integer;
  v_assets_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_versions_seen from public.exercise_media_versions;
  select count(*) into v_assets_seen from public.exercise_media_assets;

  execute 'reset role';

  if v_versions_seen <> 1 then
    raise exception 'TEST FAILED: authenticated saw % versions, expected exactly 1 (published only)',
      v_versions_seen;
  end if;

  -- The motion_video asset inserted in block 7 belongs to the Draft-then-
  -- published version (20000000...0001), so it must now be visible; assets
  -- on Draft/Trash versions must not be.
  if v_assets_seen <> 1 then
    raise exception 'TEST FAILED: authenticated saw % assets, expected exactly 1 (published version only)',
      v_assets_seen;
  end if;

  raise notice 'PASS: 9. authenticated sees only Published version/asset rows';
end $$;

-- ---------------------------------------------------------------------------
-- 10. `authenticated` cannot read the audit-event table at all, and cannot
--     write to any of the three tables.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'set role authenticated';

  begin
    perform count(*) from public.exercise_media_asset_events;
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to read exercise_media_asset_events';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 10a. authenticated cannot read exercise_media_asset_events';
end $$;

do $$
begin
  execute 'set role authenticated';

  begin
    insert into public.exercise_media_versions
      (exercise_id, version_number, demonstrator_key, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000003', 1, 'daniel', 'draft',
       '00000000-0000-0000-0000-000000000001');
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to INSERT a media version';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 10b. authenticated cannot insert exercise_media_versions';
end $$;

do $$
begin
  execute 'set role authenticated';

  begin
    update public.exercise_media_versions set status = 'archived'
    where id = '20000000-0000-0000-0000-000000000001';
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to UPDATE a media version';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 10c. authenticated cannot update exercise_media_versions (e.g. self-publish)';
end $$;

do $$
begin
  execute 'set role authenticated';

  begin
    delete from public.exercise_media_versions
    where id = '20000000-0000-0000-0000-000000000001';
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to DELETE a media version';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 10d. authenticated cannot delete exercise_media_versions';
end $$;

-- ---------------------------------------------------------------------------
-- 10e. Explicit privilege matrix for `authenticated`: SELECT-only on
--      exercise_media_versions/exercise_media_assets, nothing at all on
--      exercise_media_asset_events. Checked via has_table_privilege()
--      rather than by attempting each operation (TRUNCATE/REFERENCES/
--      TRIGGER are not exercised the same way INSERT/UPDATE/DELETE are in
--      10b-10d, so the privilege catalog is the direct source of truth).
--      The fixture reproduces Supabase's own default-privilege bootstrap
--      before the migration runs (see 00_fixture.sql), so this proves the
--      migration's REVOKE actually removed real grants.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  priv text;
  select_ok boolean;
  expected boolean;
  actual boolean;
begin
  foreach t in array array[
    'exercise_media_versions', 'exercise_media_assets', 'exercise_media_asset_events'
  ] loop
    select_ok := (t <> 'exercise_media_asset_events');
    foreach priv in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] loop
      expected := (priv = 'SELECT' and select_ok);
      actual := has_table_privilege('authenticated', 'public.' || t, priv);
      if actual <> expected then
        raise exception
          'TEST FAILED: authenticated has_table_privilege(%, %) = %, expected %',
          t, priv, actual, expected;
      end if;
    end loop;
  end loop;

  raise notice 'PASS: 10e. authenticated privilege matrix is SELECT-only (versions/assets) / none (events)';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Audit-event immutability: append-only, no UPDATE, no DELETE, even for
--     the privileged role.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.exercise_media_asset_events
    (id, media_version_id, event_type, to_status, actor_user_id)
  values
    ('40000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001', 'created', 'draft',
     '00000000-0000-0000-0000-000000000001');

  begin
    update public.exercise_media_asset_events
    set reason = 'tampering attempt'
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: an audit event was updated';
  exception
    when others then
      if sqlerrm not like '%append-only%' then
        raise;
      end if;
  end;

  begin
    delete from public.exercise_media_asset_events
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: an audit event was deleted';
  exception
    when others then
      if sqlerrm not like '%append-only%' then
        raise;
      end if;
  end;

  raise notice 'PASS: 11. audit events are immutable (no UPDATE, no DELETE)';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Restrictive deletion: an exercise with media history cannot be
--     deleted; a media version with audit events cannot be deleted; a
--     media version WITHOUT audit events can be deleted and correctly
--     cascades to its own assets (the one deliberate CASCADE in this
--     schema, justified because an asset is meaningless without its
--     parent version).
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    delete from public.exercises where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: an exercise with media history was deleted';
  exception
    when foreign_key_violation then null; -- expected
  end;

  begin
    delete from public.exercise_media_versions
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: a media version with audit events was deleted';
  exception
    when foreign_key_violation then null; -- expected
  end;

  raise notice 'PASS: 12a/12b. restrictive deletion protects exercises and audited versions';
end $$;

do $$
declare
  v_asset_count integer;
begin
  -- A version with no audit events and one asset, to prove the CASCADE from
  -- version -> assets is real (not merely declared) when deletion is
  -- actually allowed to proceed. Uses exercise D, which no other test
  -- touches, so it starts with a free working-version slot.
  insert into public.exercise_media_versions
    (id, exercise_id, version_number, demonstrator_key, status, created_by)
  values
    ('20000000-0000-0000-0000-000000000099',
     '10000000-0000-0000-0000-000000000004', 1, 'daniel', 'draft',
     '00000000-0000-0000-0000-000000000001');

  insert into public.exercise_media_assets
    (media_version_id, role, storage_path, mime_type, file_size_bytes)
  values
    ('20000000-0000-0000-0000-000000000099', 'hero_cover',
     'exercises/e4/versions/v1/hero.jpg', 'image/jpeg', 300000);

  delete from public.exercise_media_versions
  where id = '20000000-0000-0000-0000-000000000099';

  select count(*) into v_asset_count
  from public.exercise_media_assets
  where media_version_id = '20000000-0000-0000-0000-000000000099';

  if v_asset_count <> 0 then
    raise exception 'TEST FAILED: assets were not cascade-deleted with their version';
  end if;

  raise notice 'PASS: 12c. asset rows cascade-delete only when their parent version is (legitimately) removable';
end $$;

do $$
begin
  raise notice 'ALL EXERCISE MEDIA LIFECYCLE ASSERTIONS PASSED';
end $$;
