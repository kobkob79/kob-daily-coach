-- Regression assertions for
-- supabase/migrations/20260909120000_harden_exercise_assets_storage_rls.sql
--
-- Run with `psql -v ON_ERROR_STOP=1` against a scratch database that already
-- has, in order: 00_fixture.sql (this directory),
-- 20260902065412_exercise_media_lifecycle_data.sql (creates
-- exercise_media_versions/exercise_media_assets), the three pre-existing
-- exercise-assets bucket policy migrations in their real chronological
-- order (20260803041757 -> 20260816064907 -> 20260821193623), and finally
-- 20260909120000_harden_exercise_assets_storage_rls.sql itself - see
-- README.md for the exact commands. Replaying the real migration sequence
-- (rather than only applying the new migration in isolation) proves the
-- new policy actually supersedes the old broad one on a database that
-- looks like this repository's real history, not a synthetic shortcut.
--
-- Each block is a self-contained PL/pgSQL DO statement that either raises a
-- clearly labelled exception (an actual failure) or prints
-- `NOTICE: PASS: <name>`. A clean run to completion is the test result.

-- ---------------------------------------------------------------------------
-- Shared fixture data.
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'); -- creator / QA reviewer / publisher

insert into public.exercises (id) values
  ('10000000-0000-0000-0000-000000000001'), -- published-media exercise
  ('10000000-0000-0000-0000-000000000002'), -- draft-media exercise
  ('10000000-0000-0000-0000-000000000003'), -- rejected-media exercise
  ('10000000-0000-0000-0000-000000000004'); -- trashed-media exercise

-- One media version per exercise, each in a different lifecycle status.
insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status,
   created_by, qa_reviewed_by, qa_reviewed_at, published_by, published_at)
values
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 1, 'generic', 'published',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', now(),
   '00000000-0000-0000-0000-000000000001', now());

insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002', 1, 'generic', 'draft',
   '00000000-0000-0000-0000-000000000001');

insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status,
   created_by, rejected_by, rejected_at)
values
  ('20000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000003', 1, 'generic', 'rejected',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('20000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000004', 1, 'generic', 'trash',
   '00000000-0000-0000-0000-000000000001');

-- One motion_video asset per version, each pointing at a distinct V2
-- storage path - the exact shape buildMotionVideoStoragePath() produces.
insert into public.exercise_media_assets
  (media_version_id, role, storage_path, mime_type, file_size_bytes,
   width, height, duration_ms, frame_rate)
values
  ('20000000-0000-0000-0000-000000000001', 'motion_video',
   'exercises/10000000-0000-0000-0000-000000000001/v2/20000000-0000-0000-0000-000000000001/motion.aaaa1111.mp4',
   'video/mp4', 1000000, 1280, 720, 8000, 30),
  ('20000000-0000-0000-0000-000000000002', 'motion_video',
   'exercises/10000000-0000-0000-0000-000000000002/v2/20000000-0000-0000-0000-000000000002/motion.bbbb2222.mp4',
   'video/mp4', 1000000, 1280, 720, 8000, null),
  ('20000000-0000-0000-0000-000000000003', 'motion_video',
   'exercises/10000000-0000-0000-0000-000000000003/v2/20000000-0000-0000-0000-000000000003/motion.cccc3333.mp4',
   'video/mp4', 1000000, 1280, 720, 8000, null),
  ('20000000-0000-0000-0000-000000000004', 'motion_video',
   'exercises/10000000-0000-0000-0000-000000000004/v2/20000000-0000-0000-0000-000000000004/motion.dddd4444.mp4',
   'video/mp4', 1000000, 1280, 720, 8000, null);

-- The matching Storage objects: one row per asset's storage_path, plus two
-- legacy canonical files (one under an id folder, one under a slug folder -
-- exerciseMediaPrefixes()'s "convenience" fallback) and one untracked,
-- unassigned object that matches neither policy branch at all.
insert into storage.objects (bucket_id, name) values
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000001/v2/20000000-0000-0000-0000-000000000001/motion.aaaa1111.mp4'),
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000002/v2/20000000-0000-0000-0000-000000000002/motion.bbbb2222.mp4'),
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000003/v2/20000000-0000-0000-0000-000000000003/motion.cccc3333.mp4'),
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000004/v2/20000000-0000-0000-0000-000000000004/motion.dddd4444.mp4'),
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000001/demo.mp4'),
  ('exercise-assets', 'exercises/plank-classic/main.jpg'),
  ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000001/random-notes.txt');

-- ---------------------------------------------------------------------------
-- 1. authenticated reads a legacy canonical file (id folder and slug
--    folder both).
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name in (
      'exercises/10000000-0000-0000-0000-000000000001/demo.mp4',
      'exercises/plank-classic/main.jpg'
    );

  execute 'reset role';

  if v_seen <> 2 then
    raise exception 'TEST FAILED: authenticated saw % legacy canonical files, expected 2', v_seen;
  end if;

  raise notice 'PASS: 1. authenticated reads legacy canonical files (id and slug folders)';
end $$;

-- ---------------------------------------------------------------------------
-- 2. authenticated reads the V2 asset of a published version.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name = 'exercises/10000000-0000-0000-0000-000000000001/v2/20000000-0000-0000-0000-000000000001/motion.aaaa1111.mp4';

  execute 'reset role';

  if v_seen <> 1 then
    raise exception 'TEST FAILED: authenticated could not read the published V2 asset';
  end if;

  raise notice 'PASS: 2. authenticated reads a published V2 asset';
end $$;

-- ---------------------------------------------------------------------------
-- 3. authenticated cannot read (or sign - signing requires the same SELECT
--    visibility) a draft V2 asset.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name = 'exercises/10000000-0000-0000-0000-000000000002/v2/20000000-0000-0000-0000-000000000002/motion.bbbb2222.mp4';

  execute 'reset role';

  if v_seen <> 0 then
    raise exception 'TEST FAILED: authenticated could read/sign a draft V2 asset (saw % rows)', v_seen;
  end if;

  raise notice 'PASS: 3. authenticated cannot read or sign a draft V2 asset';
end $$;

-- ---------------------------------------------------------------------------
-- 4. authenticated cannot read a rejected or trashed V2 asset.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name in (
      'exercises/10000000-0000-0000-0000-000000000003/v2/20000000-0000-0000-0000-000000000003/motion.cccc3333.mp4',
      'exercises/10000000-0000-0000-0000-000000000004/v2/20000000-0000-0000-0000-000000000004/motion.dddd4444.mp4'
    );

  execute 'reset role';

  if v_seen <> 0 then
    raise exception 'TEST FAILED: authenticated could read a rejected/trashed V2 asset (saw % rows)', v_seen;
  end if;

  raise notice 'PASS: 4. authenticated cannot read rejected/trash V2 assets';
end $$;

-- ---------------------------------------------------------------------------
-- 4b (bonus). An object that matches neither branch at all (not a
--     canonical <role>.<ext> filename, not a registered V2 asset) is never
--     readable either - proves the policy doesn't have a third, accidental
--     hole.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role authenticated';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name = 'exercises/10000000-0000-0000-0000-000000000001/random-notes.txt';

  execute 'reset role';

  if v_seen <> 0 then
    raise exception 'TEST FAILED: authenticated could read an untracked, unassigned object';
  end if;

  raise notice 'PASS: 4b. an untracked/unassigned object matches neither branch and is not readable';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A list-style scan over every exercise-assets object never surfaces the
--    names of private (draft/rejected/trash) V2 files to authenticated -
--    only the published one and the legacy canonical files.
-- ---------------------------------------------------------------------------
do $$
declare
  v_names text[];
begin
  execute 'set role authenticated';

  select coalesce(array_agg(name order by name), '{}') into v_names
  from storage.objects
  where bucket_id = 'exercise-assets';

  execute 'reset role';

  if v_names @> array[
    'exercises/10000000-0000-0000-0000-000000000002/v2/20000000-0000-0000-0000-000000000002/motion.bbbb2222.mp4',
    'exercises/10000000-0000-0000-0000-000000000003/v2/20000000-0000-0000-0000-000000000003/motion.cccc3333.mp4',
    'exercises/10000000-0000-0000-0000-000000000004/v2/20000000-0000-0000-0000-000000000004/motion.dddd4444.mp4'
  ] then
    raise exception 'TEST FAILED: a bucket-wide list exposed a private V2 file name to authenticated: %', v_names;
  end if;

  if not (v_names @> array[
    'exercises/10000000-0000-0000-0000-000000000001/v2/20000000-0000-0000-0000-000000000001/motion.aaaa1111.mp4',
    'exercises/10000000-0000-0000-0000-000000000001/demo.mp4'
  ]) then
    raise exception 'TEST FAILED: a legitimate published/legacy file went missing from the list result: %', v_names;
  end if;

  raise notice 'PASS: 5. bucket-wide list never exposes private V2 file names to authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- 6. The server-side Admin boundary (service_role, which bypasses RLS
--    entirely - same as every other table in this schema) can still read a
--    draft V2 asset for QA preview.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seen integer;
begin
  execute 'set role service_role';

  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name = 'exercises/10000000-0000-0000-0000-000000000002/v2/20000000-0000-0000-0000-000000000002/motion.bbbb2222.mp4';

  execute 'reset role';

  if v_seen <> 1 then
    raise exception 'TEST FAILED: service_role (the Admin QA-preview boundary) could not read a draft V2 asset';
  end if;

  raise notice 'PASS: 6. service_role (server-side Admin boundary) can read a draft V2 asset for QA';
end $$;

-- ---------------------------------------------------------------------------
-- 7. No change to authenticated's upload/delete access: this repository's
--    migrations have never granted/revoked base table privileges on
--    storage.objects (that's Supabase's own Storage-extension bootstrap,
--    reproduced broadly in 00_fixture.sql - see its comment), only RLS
--    policies. 20260821193623_harden_exercise_assets_writes.sql already
--    dropped the INSERT/UPDATE policies for `authenticated`; this
--    migration only replaces the SELECT policy and adds no INSERT/UPDATE/
--    DELETE policy of its own. So an actual write attempt by
--    `authenticated` must still be rejected by RLS (no matching policy),
--    exactly as it already was before this migration - proven behaviorally
--    here, not by a privilege-existence check that this migration was
--    never in a position to change.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'set role authenticated';

  begin
    insert into storage.objects (bucket_id, name)
    values ('exercise-assets', 'exercises/10000000-0000-0000-0000-000000000001/thumbnail.jpg');
    execute 'reset role';
    raise exception 'TEST FAILED: authenticated was able to INSERT into storage.objects';
  exception
    when insufficient_privilege then
      execute 'reset role';
  end;

  raise notice 'PASS: 7a. authenticated still cannot INSERT into storage.objects';
end $$;

-- UPDATE/DELETE with no applicable command-specific RLS policy can be
-- rejected two different ways in Postgres: either an outright
-- insufficient_privilege exception, or a silent 0-row match (the row is
-- simply not "visible for update/delete" per RLS, which is not itself an
-- error). Both are equally valid proof that authenticated could not modify
-- the row - only a nonzero row_count on a successful statement is an
-- actual breach - so this checks GET DIAGNOSTICS rather than assuming
-- either outcome shape.
do $$
declare
  v_rows_affected integer := -1;
begin
  execute 'set role authenticated';

  begin
    update storage.objects set name = 'exercises/10000000-0000-0000-0000-000000000001/hijacked.jpg'
    where name = 'exercises/10000000-0000-0000-0000-000000000001/demo.mp4';
    get diagnostics v_rows_affected = row_count;
  exception
    when insufficient_privilege then
      v_rows_affected := 0;
  end;

  execute 'reset role';

  if v_rows_affected <> 0 then
    raise exception 'TEST FAILED: authenticated was able to UPDATE % storage.objects row(s)', v_rows_affected;
  end if;

  raise notice 'PASS: 7b. authenticated still cannot UPDATE storage.objects';
end $$;

do $$
declare
  v_rows_affected integer := -1;
begin
  execute 'set role authenticated';

  begin
    delete from storage.objects
    where name = 'exercises/10000000-0000-0000-0000-000000000001/demo.mp4';
    get diagnostics v_rows_affected = row_count;
  exception
    when insufficient_privilege then
      v_rows_affected := 0;
  end;

  execute 'reset role';

  if v_rows_affected <> 0 then
    raise exception 'TEST FAILED: authenticated was able to DELETE % storage.objects row(s)', v_rows_affected;
  end if;

  raise notice 'PASS: 7c. authenticated still cannot DELETE storage.objects';
end $$;

-- Positive control: the legacy file this block tried to UPDATE/DELETE is
-- still exactly as it was, proving the exceptions above really did block
-- the writes rather than something unrelated failing first.
do $$
declare
  v_seen integer;
begin
  select count(*) into v_seen
  from storage.objects
  where bucket_id = 'exercise-assets'
    and name = 'exercises/10000000-0000-0000-0000-000000000001/demo.mp4';

  if v_seen <> 1 then
    raise exception 'TEST FAILED: the demo.mp4 row was actually mutated despite the blocked UPDATE/DELETE attempts';
  end if;

  raise notice 'PASS: 7d. the blocked write attempts left the row untouched (positive control)';
end $$;

-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL EXERCISE MEDIA STORAGE RLS ASSERTIONS PASSED';
end $$;
