-- Seeds pre-existing daniel/maya rows BEFORE the follow-up migration
-- (20260902084229_exercise_media_v2_followup.sql) is applied, so
-- 04_followup_assertions.sql can prove that migration's normalization
-- UPDATE genuinely rewrites existing data rather than merely gating new
-- inserts. Apply strictly between the two migrations - see README.md.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000099');

insert into public.exercises (id) values
  ('10000000-0000-0000-0000-000000000091'), -- legacy daniel row
  ('10000000-0000-0000-0000-000000000092'); -- legacy maya row

insert into public.exercise_media_versions
  (id, exercise_id, version_number, demonstrator_key, status, created_by)
values
  ('50000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000091', 1, 'daniel', 'draft',
   '00000000-0000-0000-0000-000000000099'),
  ('50000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000092', 1, 'maya', 'draft',
   '00000000-0000-0000-0000-000000000099');
