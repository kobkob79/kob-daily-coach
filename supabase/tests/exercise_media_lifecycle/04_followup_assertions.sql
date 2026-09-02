-- Regression assertions for
-- supabase/migrations/20260902084229_exercise_media_v2_followup.sql
--
-- Apply after: 00_fixture.sql -> migration 20260902065412 ->
-- 03_followup_seed_legacy_rows.sql -> migration 20260902084229 -> this
-- file. See README.md for the exact command sequence.

-- ---------------------------------------------------------------------------
-- 1. The migration's UPDATE genuinely normalized pre-existing daniel/maya
--    rows to generic (not merely gated future inserts).
-- ---------------------------------------------------------------------------
do $$
declare
  v_daniel_now text;
  v_maya_now text;
begin
  select demonstrator_key into v_daniel_now
  from public.exercise_media_versions where id = '50000000-0000-0000-0000-000000000001';
  select demonstrator_key into v_maya_now
  from public.exercise_media_versions where id = '50000000-0000-0000-0000-000000000002';

  if v_daniel_now <> 'generic' or v_maya_now <> 'generic' then
    raise exception 'TEST FAILED: legacy daniel/maya rows were not normalized to generic (got % / %)',
      v_daniel_now, v_maya_now;
  end if;

  raise notice 'PASS: 1. pre-existing daniel/maya rows normalized to generic';
end $$;

-- ---------------------------------------------------------------------------
-- 2. demonstrator_key: generic succeeds; daniel/maya/ortal/arbitrary fail.
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000093');

do $$
begin
  insert into public.exercise_media_versions
    (exercise_id, version_number, demonstrator_key, status, created_by)
  values
    ('10000000-0000-0000-0000-000000000093', 1, 'generic', 'draft',
     '00000000-0000-0000-0000-000000000099');

  raise notice 'PASS: 2a. demonstrator_key = generic succeeds';
end $$;

do $$
declare
  v_case text;
begin
  foreach v_case in array array['daniel', 'maya', 'ortal', 'bogus_value'] loop
    begin
      insert into public.exercise_media_versions
        (exercise_id, version_number, demonstrator_key, status, created_by)
      values
        ('10000000-0000-0000-0000-000000000093', 99, v_case, 'draft',
         '00000000-0000-0000-0000-000000000099');
      raise exception 'TEST FAILED: demonstrator_key = % was accepted', v_case;
    exception
      when check_violation then null; -- expected
    end;
  end loop;

  raise notice 'PASS: 2b. daniel/maya/ortal/arbitrary values all rejected';
end $$;

do $$
declare
  v_default text;
begin
  -- Column default applies when demonstrator_key is omitted entirely.
  execute $i$
    insert into public.exercise_media_versions
      (exercise_id, version_number, status, created_by)
    values
      ('10000000-0000-0000-0000-000000000093', 2, 'trash', '00000000-0000-0000-0000-000000000099')
    returning demonstrator_key
  $i$ into v_default;

  if v_default <> 'generic' then
    raise exception 'TEST FAILED: column default was % , expected generic', v_default;
  end if;

  raise notice 'PASS: 2c. demonstrator_key defaults to generic when omitted';
end $$;

-- ---------------------------------------------------------------------------
-- 3. frame_rate: NULL (unverified) and exactly 30 succeed; any other
--    non-null value still fails.
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000094');
insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('50000000-0000-0000-0000-000000000010',
   '10000000-0000-0000-0000-000000000094', 1, 'generic', 'draft',
   '00000000-0000-0000-0000-000000000099');

do $$
begin
  insert into public.exercise_media_assets
    (media_version_id, role, storage_path, mime_type, file_size_bytes,
     width, height, duration_ms, frame_rate)
  values
    ('50000000-0000-0000-0000-000000000010', 'motion_video',
     'exercises/e94/v2/v10/motion.mp4', 'video/mp4', 2000000, 1280, 720, 8000, null);

  raise notice 'PASS: 3a. an unverified (NULL) frame_rate is now accepted for a Draft motion_video row';
end $$;

do $$
begin
  begin
    insert into public.exercise_media_assets
      (media_version_id, role, storage_path, mime_type, file_size_bytes,
       width, height, duration_ms, frame_rate)
    values
      ('50000000-0000-0000-0000-000000000010', 'motion_video',
       'exercises/e94/v2/v10/motion-2.mp4', 'video/mp4', 2000000, 1280, 720, 8000, 29.97);
    raise exception 'TEST FAILED: frame_rate = 29.97 was accepted';
  exception
    when unique_violation then
      raise exception 'TEST FAILED: got unique_violation instead of a frame_rate check_violation - fix the test fixture';
    when check_violation then null; -- expected
  end;

  raise notice 'PASS: 3b. a wrong non-null frame_rate (29.97) is still rejected';
end $$;

-- ---------------------------------------------------------------------------
-- 4. finalize_exercise_motion_video_asset(): atomic new-Draft finalization
--    (asset row + both events in one call), and atomic replacement
--    (asset row updated in place + exactly one new event).
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000095');
insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('50000000-0000-0000-0000-000000000020',
   '10000000-0000-0000-0000-000000000095', 1, 'generic', 'draft',
   '00000000-0000-0000-0000-000000000099');

do $$
declare
  v_asset_id uuid;
  v_asset_count integer;
  v_event_count integer;
begin
  select public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000020', -- media_version_id
    true,                                    -- is_new_draft
    'exercises/e95/v2/v20/motion.mp4',       -- storage_path
    'video/mp4', 2000000, 1280, 720, 8000,
    null,                                    -- frame_rate: unverified
    null,                                    -- checksum
    '00000000-0000-0000-0000-000000000099',  -- actor
    false                                    -- replaced_previous
  ) into v_asset_id;

  if v_asset_id is null then
    raise exception 'TEST FAILED: finalize function returned no asset id';
  end if;

  select count(*) into v_asset_count from public.exercise_media_assets
    where media_version_id = '50000000-0000-0000-0000-000000000020';
  select count(*) into v_event_count from public.exercise_media_asset_events
    where media_version_id = '50000000-0000-0000-0000-000000000020';

  if v_asset_count <> 1 then
    raise exception 'TEST FAILED: expected exactly 1 asset row, got %', v_asset_count;
  end if;
  if v_event_count <> 2 then
    raise exception 'TEST FAILED: expected exactly 2 events (created + asset_uploaded), got %', v_event_count;
  end if;

  raise notice 'PASS: 4a. atomic new-Draft finalization writes one asset row and both events together';
end $$;

do $$
declare
  v_asset_id uuid;
  v_path text;
  v_event_count integer;
begin
  select public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000020',
    false, -- not a new draft this time
    'exercises/e95/v2/v20/motion.replacement-token.mp4',
    'video/mp4', 2100000, 1280, 720, 8500,
    30, -- now genuinely verified
    'a'||repeat('b', 63),
    '00000000-0000-0000-0000-000000000099',
    true -- replaced_previous
  ) into v_asset_id;

  select storage_path into v_path from public.exercise_media_assets where id = v_asset_id;
  if v_path <> 'exercises/e95/v2/v20/motion.replacement-token.mp4' then
    raise exception 'TEST FAILED: replacement did not switch the asset row to the new path (got %)', v_path;
  end if;

  select count(*) into v_event_count from public.exercise_media_asset_events
    where media_version_id = '50000000-0000-0000-0000-000000000020';
  if v_event_count <> 3 then
    raise exception 'TEST FAILED: expected 3 total events after one replacement (2 + 1), got %', v_event_count;
  end if;

  raise notice 'PASS: 4b. atomic replacement upserts the same asset row (no duplicate) and appends exactly one new event';
end $$;

-- ---------------------------------------------------------------------------
-- 5. The finalize function is service_role-only.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'set role authenticated';
  begin
    perform public.finalize_exercise_motion_video_asset(
      '50000000-0000-0000-0000-000000000020', false,
      'exercises/e95/v2/v20/motion-hack.mp4', 'video/mp4', 1000, 1280, 720, 8000,
      null, null, '00000000-0000-0000-0000-000000000099', false
    );
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to call finalize_exercise_motion_video_asset';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 5. authenticated cannot execute the finalize function directly';
end $$;

do $$
begin
  raise notice 'ALL FOLLOW-UP MIGRATION ASSERTIONS PASSED';
end $$;
