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
-- 4. reserve_exercise_media_draft(): creates once, reuses deterministically,
--    reports a conflict for a non-Draft working version, and does not
--    disturb a Published version for the same exercise.
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000095');

do $$
declare
  v_first record;
  v_second record;
begin
  select * into v_first from public.reserve_exercise_media_draft(
    '10000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000099'
  );
  if v_first.outcome <> 'reserved' or v_first.is_new_draft <> true or v_first.demonstrator_key <> 'generic' then
    raise exception 'TEST FAILED: first reservation was not a fresh generic Draft (got %, %, %)',
      v_first.outcome, v_first.is_new_draft, v_first.demonstrator_key;
  end if;

  select * into v_second from public.reserve_exercise_media_draft(
    '10000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000099'
  );
  if v_second.outcome <> 'reserved' or v_second.is_new_draft <> false
     or v_second.media_version_id <> v_first.media_version_id then
    raise exception 'TEST FAILED: second call did not deterministically reuse the same Draft (got %, %, id %)',
      v_second.outcome, v_second.is_new_draft, v_second.media_version_id;
  end if;

  if (select count(*) from public.exercise_media_versions
      where exercise_id = '10000000-0000-0000-0000-000000000095') <> 1 then
    raise exception 'TEST FAILED: two calls for the same exercise created more than one version row';
  end if;

  raise notice 'PASS: 4a. reserve_exercise_media_draft creates once, then deterministically reuses';
end $$;

do $$
declare
  v_result record;
begin
  update public.exercise_media_versions
  set status = 'qa_passed', qa_reviewed_by = '00000000-0000-0000-0000-000000000099', qa_reviewed_at = now()
  where exercise_id = '10000000-0000-0000-0000-000000000095';

  select * into v_result from public.reserve_exercise_media_draft(
    '10000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000099'
  );
  if v_result.outcome <> 'conflict' or v_result.blocked_status <> 'qa_passed' then
    raise exception 'TEST FAILED: expected a conflict against qa_passed, got % / %',
      v_result.outcome, v_result.blocked_status;
  end if;
  if (select count(*) from public.exercise_media_versions
      where exercise_id = '10000000-0000-0000-0000-000000000095') <> 1 then
    raise exception 'TEST FAILED: a conflicting reservation attempt created an extra version row';
  end if;

  raise notice 'PASS: 4b. reserve_exercise_media_draft reports a conflict for a non-Draft working version, writing nothing';
end $$;

-- Advisory-lock statement presence + a true concurrency test are two
-- different claims; see the note at the end of this file for why real
-- concurrent execution is not exercised by this single-connection harness.
do $$
declare
  v_source text;
begin
  select prosrc into v_source from pg_proc where proname = 'reserve_exercise_media_draft';
  if v_source not like '%pg_advisory_xact_lock%' then
    raise exception 'TEST FAILED: reserve_exercise_media_draft no longer takes an advisory lock';
  end if;
  raise notice 'PASS: 4c. reserve_exercise_media_draft''s definition still takes a pg_advisory_xact_lock';
end $$;

-- ---------------------------------------------------------------------------
-- 5. finalize_exercise_motion_video_asset(): atomic new-Draft finalization,
--    atomic re-checked replacement (needs_confirmation vs finalized), the
--    Draft-status re-check (never touches a non-Draft version), and
--    outcomes for an unknown version.
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000096');
insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('50000000-0000-0000-0000-000000000020',
   '10000000-0000-0000-0000-000000000096', 1, 'generic', 'draft',
   '00000000-0000-0000-0000-000000000099');

do $$
declare
  v_result record;
  v_asset_count integer;
  v_event_count integer;
begin
  select * into v_result from public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000020', -- media_version_id
    false,                                   -- confirm_replace (irrelevant: no prior asset)
    'exercises/e96/v2/v20/motion.tok1.mp4',  -- storage_path
    'video/mp4', 2000000, 1280, 720, 8000,
    null,                                    -- frame_rate: unverified
    null,                                    -- checksum
    '00000000-0000-0000-0000-000000000099'   -- actor
  );

  if v_result.outcome <> 'finalized' or v_result.asset_id is null or v_result.was_replacement <> false
     or v_result.previous_storage_path is not null then
    raise exception 'TEST FAILED: first finalize did not report a clean new-asset outcome (got %, replacement=%, prev=%)',
      v_result.outcome, v_result.was_replacement, v_result.previous_storage_path;
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

  raise notice 'PASS: 5a. atomic new-Draft finalization writes one asset row and both events together';
end $$;

do $$
declare
  v_result record;
begin
  select * into v_result from public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000020', false, -- NOT confirmed
    'exercises/e96/v2/v20/motion.tok2.mp4', 'video/mp4', 2100000, 1280, 720, 8500,
    null, null, '00000000-0000-0000-0000-000000000099'
  );

  if v_result.outcome <> 'needs_confirmation' or v_result.previous_storage_path <> 'exercises/e96/v2/v20/motion.tok1.mp4' then
    raise exception 'TEST FAILED: expected needs_confirmation with the real previous path, got % / %',
      v_result.outcome, v_result.previous_storage_path;
  end if;

  if (select count(*) from public.exercise_media_assets
      where media_version_id = '50000000-0000-0000-0000-000000000020') <> 1
     or (select storage_path from public.exercise_media_assets
         where media_version_id = '50000000-0000-0000-0000-000000000020') <> 'exercises/e96/v2/v20/motion.tok1.mp4' then
    raise exception 'TEST FAILED: an unconfirmed replacement attempt changed the stored asset row';
  end if;
  if (select count(*) from public.exercise_media_asset_events
      where media_version_id = '50000000-0000-0000-0000-000000000020') <> 2 then
    raise exception 'TEST FAILED: an unconfirmed replacement attempt wrote an event';
  end if;

  raise notice 'PASS: 5b. an unconfirmed replacement attempt is rejected with the real previous path and changes nothing';
end $$;

do $$
declare
  v_result record;
  v_event_count integer;
begin
  select * into v_result from public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000020', true, -- confirmed
    'exercises/e96/v2/v20/motion.tok2.mp4', 'video/mp4', 2100000, 1280, 720, 8500,
    30, 'a'||repeat('b', 63), '00000000-0000-0000-0000-000000000099'
  );

  if v_result.outcome <> 'finalized' or v_result.was_replacement <> true
     or v_result.previous_storage_path <> 'exercises/e96/v2/v20/motion.tok1.mp4' then
    raise exception 'TEST FAILED: confirmed replacement did not report the correct outcome (got %, replacement=%, prev=%)',
      v_result.outcome, v_result.was_replacement, v_result.previous_storage_path;
  end if;

  if (select storage_path from public.exercise_media_assets where id = v_result.asset_id)
      <> 'exercises/e96/v2/v20/motion.tok2.mp4' then
    raise exception 'TEST FAILED: confirmed replacement did not switch the asset row to the new path';
  end if;
  if (select count(*) from public.exercise_media_assets
      where media_version_id = '50000000-0000-0000-0000-000000000020') <> 1 then
    raise exception 'TEST FAILED: replacement created a second asset row instead of upserting the existing one';
  end if;

  select count(*) into v_event_count from public.exercise_media_asset_events
    where media_version_id = '50000000-0000-0000-0000-000000000020';
  if v_event_count <> 3 then
    raise exception 'TEST FAILED: expected 3 total events after one replacement (2 + 1), got %', v_event_count;
  end if;

  raise notice 'PASS: 5c. confirmed replacement atomically upserts the same asset row and appends exactly one event';
end $$;

do $$
declare
  v_result record;
begin
  select * into v_result from public.finalize_exercise_motion_video_asset(
    '99999999-9999-9999-9999-999999999999', false,
    'exercises/nope/v2/v/motion.mp4', 'video/mp4', 1000, 1280, 720, 8000,
    null, null, '00000000-0000-0000-0000-000000000099'
  );
  if v_result.outcome <> 'version_not_found' then
    raise exception 'TEST FAILED: expected version_not_found for an unknown version id, got %', v_result.outcome;
  end if;

  raise notice 'PASS: 5d. finalize reports version_not_found for an unknown media_version_id';
end $$;

-- ---------------------------------------------------------------------------
-- 6. finalize never modifies an asset belonging to a non-Draft version -
--    covers Published explicitly, plus the general status re-check.
-- ---------------------------------------------------------------------------
insert into public.exercises (id) values ('10000000-0000-0000-0000-000000000097');
insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by,
   qa_reviewed_by, qa_reviewed_at, published_by, published_at)
values
  ('50000000-0000-0000-0000-000000000030',
   '10000000-0000-0000-0000-000000000097', 1, 'generic', 'published',
   '00000000-0000-0000-0000-000000000099',
   '00000000-0000-0000-0000-000000000099', now(),
   '00000000-0000-0000-0000-000000000099', now());
insert into public.exercise_media_assets
  (id, media_version_id, role, storage_path, mime_type, file_size_bytes,
   width, height, duration_ms, frame_rate)
values
  ('50000000-0000-0000-0000-000000000040',
   '50000000-0000-0000-0000-000000000030', 'motion_video',
   'exercises/e97/v2/v30/motion.published.mp4', 'video/mp4', 2000000, 1280, 720, 8000, 30);

do $$
declare
  v_result record;
  v_path_after text;
begin
  select * into v_result from public.finalize_exercise_motion_video_asset(
    '50000000-0000-0000-0000-000000000030', true, -- even with confirmation
    'exercises/e97/v2/v30/motion.hijack-attempt.mp4', 'video/mp4', 999, 1280, 720, 8000,
    30, null, '00000000-0000-0000-0000-000000000099'
  );

  if v_result.outcome <> 'version_not_draft' or v_result.blocked_status <> 'published' then
    raise exception 'TEST FAILED: expected version_not_draft/published, got % / %',
      v_result.outcome, v_result.blocked_status;
  end if;

  select storage_path into v_path_after from public.exercise_media_assets
    where id = '50000000-0000-0000-0000-000000000040';
  if v_path_after <> 'exercises/e97/v2/v30/motion.published.mp4' then
    raise exception 'TEST FAILED: the Published asset row was modified (now %)', v_path_after;
  end if;

  raise notice 'PASS: 6. finalize never modifies a Published version''s asset, even with confirm_replace = true';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Both new functions are service_role-only.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'set role authenticated';
  begin
    perform public.reserve_exercise_media_draft(
      '10000000-0000-0000-0000-000000000097', '00000000-0000-0000-0000-000000000099'
    );
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to call reserve_exercise_media_draft';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 7a. authenticated cannot execute reserve_exercise_media_draft directly';
end $$;

do $$
begin
  execute 'set role authenticated';
  begin
    perform public.finalize_exercise_motion_video_asset(
      '50000000-0000-0000-0000-000000000020', false,
      'exercises/e96/v2/v20/motion-hack.mp4', 'video/mp4', 1000, 1280, 720, 8000,
      null, null, '00000000-0000-0000-0000-000000000099'
    );
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to call finalize_exercise_motion_video_asset';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 7b. authenticated cannot execute finalize_exercise_motion_video_asset directly';
end $$;

do $$
begin
  raise notice 'ALL FOLLOW-UP MIGRATION ASSERTIONS PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- Note on concurrency: this harness runs every statement sequentially over
-- one psql connection, so genuinely concurrent RPC calls (two real
-- transactions blocked on the same pg_advisory_xact_lock at the same
-- instant) are not exercised here. What IS proven above: (a) the lock
-- statement is actually present in the deployed function body (4c), and
-- (b) sequential reuse is fully deterministic - the same Draft comes back
-- every time, and a conflicting status is reported without ever creating a
-- second row (4a/4b). A true multi-connection race test would need two
-- concurrent psql sessions coordinated outside this single-file harness;
-- documenting that as a limitation rather than simulating a false positive.
-- ---------------------------------------------------------------------------
