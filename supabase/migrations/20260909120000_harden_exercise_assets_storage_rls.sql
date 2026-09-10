-- Harden exercise-assets Storage RLS (VIORA-EXERCISE-MEDIA-CROSS-SURFACE-
-- SYNC-001, finding F1).
--
-- "Authenticated users can read exercise assets"
-- (20260803041757_0236bc41-d849-48a9-9c47-72ed3751e3d7.sql) grants
-- `USING (bucket_id = 'exercise-assets')` with no further scoping: any
-- authenticated user can list/sign/download ANY object in the bucket,
-- including exercises/<id>/v2/<mediaVersionId>/motion.<token>.mp4 - the V2
-- Motion Video pipeline's own Draft/QA storage path
-- (see src/lib/exercise-media-v2.ts's buildMotionVideoStoragePath) -
-- regardless of the owning exercise_media_versions.status.
--
-- exercise_media_versions/exercise_media_assets already restrict their own
-- *rows* to authenticated to status = 'published'
-- (20260902065412_exercise_media_lifecycle_data.sql's "published media
-- versions are readable" / "assets of published media versions are
-- readable" policies) - but that table-level RLS says nothing about the
-- Storage *object* layer, which Supabase authorizes completely separately.
-- A client can call the Storage API directly (list/createSignedUrl/
-- download) without ever touching those tables, so the wide bucket-level
-- policy above was a real, independent exposure of draft/rejected/
-- replacement_required/trash/archived Motion Video bytes - not just a UI
-- inconsistency.
--
-- This migration closes that gap: authenticated may read an
-- exercise-assets object only when it is either
--   (a) a legacy canonical role file directly under
--       exercises/<id-or-slug>/<thumbnail|main|guide>.<image-ext> or
--       exercises/<id-or-slug>/demo.<video-ext> - one folder segment deep
--       (so a v2/ subfolder, or anything else, can never match), with the
--       extension restricted to exactly the allowlists
--       exercise-media-assignment-core.ts's validateAssignmentInput()
--       already enforces on write (IMAGE_EXTENSIONS / VIDEO_EXTENSIONS) -
--       this is the only shape assignExerciseMediaServer ever writes, so
--       the read policy stays no more permissive than the write path; or
--   (b) a V2 asset whose *exact* recorded storage_path
--       (exercise_media_assets.storage_path) belongs to a version that has
--       reached status = 'published' - matched by the metadata the
--       trusted server itself wrote, never inferred from the object's path
--       shape.
--
-- No change to INSERT/UPDATE/DELETE: those were already revoked from
-- `authenticated` in 20260821193623_harden_exercise_assets_writes.sql and
-- stay revoked here - only the server-side Admin flow (service_role, which
-- bypasses RLS entirely) ever writes to this bucket. `anon` was never
-- granted a read policy on this bucket and still isn't.
--
-- Committed only - per the Exercise Media Cross-Surface Sync task
-- boundaries, this migration is NOT applied to any remote/production
-- Supabase project in this session. See
-- supabase/tests/exercise_media_storage_rls/ for a local proof against a
-- real (throwaway) Postgres database, replaying the exact chronological
-- migration sequence this repository would apply.

drop policy if exists "Authenticated users can read exercise assets"
on storage.objects;

create policy "authenticated reads canonical or published exercise media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exercise-assets'
  and (
    -- (a) legacy canonical: exercises/<id-or-slug>/<role>.<ext>, exactly
    -- one folder segment deep (a v2/... path always has more segments and
    -- can never match this branch) and restricted to the exact media
    -- extensions each role is ever written with - never an arbitrary
    -- alphanumeric extension.
    name ~ '^exercises/[^/]+/(thumbnail|main|guide)\.(jpg|jpeg|png|webp|avif|heic)$'
    or name ~ '^exercises/[^/]+/demo\.(mp4|webm|mov|m4v)$'
    or
    -- (b) V2, gated by the owning version's actual publish status.
    exists (
      select 1
      from public.exercise_media_assets a
      join public.exercise_media_versions v on v.id = a.media_version_id
      where a.storage_path = storage.objects.name
        and v.status = 'published'
    )
  )
);

comment on policy "authenticated reads canonical or published exercise media"
on storage.objects is
  'Scopes exercise-assets reads to legacy canonical role files and '
  'published-only V2 assets. See VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001 '
  'finding F1 - supersedes the unconditional bucket-wide SELECT policy this '
  'migration drops.';
