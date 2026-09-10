# Exercise Media Storage RLS — local regression validation

Validates
`supabase/migrations/20260909120000_harden_exercise_assets_storage_rls.sql`
against a throwaway Postgres database, by replaying the **real chronological
migration sequence** this repository would apply — not just the new
migration in isolation — so the test proves the new policy actually
supersedes the old broad one, on a database that looks like this
repository's real history.

Unlike the sibling `exercise_media_lifecycle` suite (authored in a sandbox
with no local Postgres), this one was run against a real local PostgreSQL 16
server (`service postgresql start`), which was available in the environment
this migration was authored in.

## How it was run

```bash
createdb exercise_media_storage_rls_test

psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_media_storage_rls/00_fixture.sql

# Real chronological order:
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260902084229_exercise_media_v2_followup.sql
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260803041757_0236bc41-d849-48a9-9c47-72ed3751e3d7.sql
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260816064907_412ff7e6-0e55-494a-b247-327c0e196a8a.sql
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260821193623_harden_exercise_assets_writes.sql
psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260909120000_harden_exercise_assets_storage_rls.sql

psql -d exercise_media_storage_rls_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_media_storage_rls/01_assertions.sql

dropdb exercise_media_storage_rls_test
```

`01_assertions.sql` is a sequence of self-contained PL/pgSQL `DO` blocks,
same convention as the sibling suite: each either raises a clearly labelled
`TEST FAILED: ...` exception or prints `NOTICE: PASS: ...`; a clean run
ending in `NOTICE: ALL EXERCISE MEDIA STORAGE RLS ASSERTIONS PASSED` is the
test result. Run with `-v ON_ERROR_STOP=1` so a real failure aborts loudly
at the point of failure.

## Coverage

1. `authenticated` reads a legacy canonical file, both under an exercise-id
   folder and under a name-slug folder (`exerciseMediaPrefixes()`'s
   convenience fallback).
2. `authenticated` reads the V2 Motion Video asset of a `published` version.
3. `authenticated` cannot read (or, since Supabase signing requires the same
   SELECT visibility, sign) a `draft` version's V2 asset.
4. `authenticated` cannot read a `rejected` or `trash` version's V2 asset.
4b. An object matching neither policy branch at all (not a canonical
    `<role>.<ext>` filename, not a registered V2 asset row) is never
    readable either — proves there is no accidental third hole.
4c. The legacy branch's canonical-path hardening: a disallowed extension
    (`.exe`, `.svg`), a role/extension mismatch (`demo.jpg`, `main.mp4`),
    a double-extension confusion attempt (`thumbnail.jpg.exe`), and genuine
    path nesting (`.../sub/thumbnail.jpg`) are all blocked — the legacy
    branch only ever matches the exact media extensions
    `exercise-media-assignment-core.ts`'s `validateAssignmentInput()`
    allows on write, one folder segment deep.
4d. Positive control for 4c: the legitimate legacy files with correct
    extensions are still readable after the hardening.
5. A bucket-wide list-style scan never surfaces the *names* of private
   (draft/rejected/trash) V2 files to `authenticated`, while the published
   and legacy files are still present in the same scan.
6. `service_role` (the server-side Admin QA-preview boundary used by
   `uploadExerciseMotionDraftServer` / `getExerciseMotionDraftStatusServer`)
   can still read a `draft` V2 asset — proves the RLS tightening does not
   break Admin QA preview, since `service_role` bypasses RLS entirely, same
   as every other table in this schema.
7. No change to `authenticated`'s upload/delete access. This repository's
   migrations have never granted/revoked base table privileges on
   `storage.objects` — only RLS policies — so this is proven behaviorally:
   an actual INSERT/UPDATE/DELETE attempt by `authenticated` is rejected by
   RLS (no matching policy), exactly as it already was before this
   migration (`20260821193623_harden_exercise_assets_writes.sql` already
   dropped the INSERT/UPDATE policies; this migration adds none). 7d is a
   positive control confirming the blocked attempts left the row untouched.

## What this does not cover

- Applying the migration through the actual Supabase CLI or against a real
  project — not installed/available in this session. Per the Exercise Media
  Cross-Surface Sync task's explicit boundaries, this migration is
  **committed only** and has not been applied to any remote/production
  Supabase project.
- The real `auth.uid()`/JWT-claims plumbing PostgREST provides on a live
  project — not exercised here since the policy under test gates on
  `bucket_id`/`name`/joined `status`, never on `auth.uid()`.
- Hero Cover (`role = 'hero_cover'`) V2 assets specifically — no client code
  writes those yet (only `buildMotionVideoStoragePath()` exists), but the
  policy's V2 branch is generic over `exercise_media_assets.storage_path`
  regardless of role, so the same published-only gate applies to it
  identically once that upload path exists.
