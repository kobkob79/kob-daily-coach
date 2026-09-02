# Exercise Media Lifecycle — local regression validation

Validates
`supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql`
against a throwaway Postgres database. The repository has no Supabase CLI /
local Supabase stack installed in the sandbox this was authored in, so
`00_fixture.sql` emulates just enough of Supabase's platform surface (
`auth.users`, `auth.uid()`, the `anon`/`authenticated`/`service_role`
roles, the pre-existing `public.exercises` / `public.touch_updated_at()`
the migration depends on, and Supabase's own project-bootstrap
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
service_role`) to exercise the migration's constraints and RLS policies
exactly as they would behave on a real project. That last point matters for
privilege testing specifically: without reproducing the default-privilege
bootstrap, a scratch table would start out with *no* grants at all (plain
Postgres, unlike Supabase, grants nothing to other roles on `CREATE TABLE`
by default), and a test asserting "`authenticated` cannot INSERT" would
pass vacuously — true only because the privilege was never granted, not
because the migration revoked it. Reproducing the default first and
independently confirming it (see "Verifying the fixture is non-vacuous"
below) makes the migration's `REVOKE` statements the thing actually under
test.

This is a self-hosted emulation, not a substitute for running the same
migration through the real Supabase CLI / hosted project before it is
applied anywhere real.

## How it was run

```bash
createdb exercise_media_lifecycle_test
psql -d exercise_media_lifecycle_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_media_lifecycle/00_fixture.sql
psql -d exercise_media_lifecycle_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql
psql -d exercise_media_lifecycle_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_media_lifecycle/01_assertions.sql
dropdb exercise_media_lifecycle_test
```

`01_assertions.sql` is a sequence of self-contained PL/pgSQL `DO` blocks.
Each either raises a clearly labelled `TEST FAILED: ...` exception or prints
`NOTICE: PASS: ...`; a clean run ending in
`NOTICE: ALL EXERCISE MEDIA LIFECYCLE ASSERTIONS PASSED` is the test result.
Run with `-v ON_ERROR_STOP=1` so any real failure aborts the script loudly
at the point of failure rather than being masked by a later statement.

## Coverage

19 assertion groups:

1. Allowed lifecycle statuses accepted; an invalid status rejected.
2. `demonstrator_key = 'ortal'` explicitly rejected (only `daniel`/`maya`
   are accepted demonstrators).
3. At most one active Draft/working version per exercise
   (`draft`/`media_ready`/`qa_passed`/`rejected`/`replacement_required`).
4. At most one Published version per exercise (reached via a required QA
   pass), and publishing an existing Draft frees the working slot for a new
   Draft without ever displacing the Published row.
5. Published/QA/Rejected field-consistency CHECK constraints.
5b. Publishing requires QA approval: `published` (with `published_by`/
    `published_at` set) is rejected without `qa_reviewed_by`/
    `qa_reviewed_at` already set; `qa_passed` is rejected without them too;
    a positive control confirms `qa_passed` *with* a completed review
    succeeds.
6. Trash retention (`purge_after` = `trashed_at` + 30 days) is defaulted by
   trigger, not left to the caller.
6b. `purge_after` cannot be scheduled earlier than `trashed_at`.
7. One asset per role per media version.
8. MP4 technical-standard limits (max 3 MiB, 6000-10000ms duration,
   1280x720, 30fps, `video/mp4` only) and the Hero Cover MIME allowlist —
   including the NULL-semantics pitfall where a `motion_video` row with a
   missing `width`/`height`/`frame_rate` must NOT silently pass a naive
   CHECK.
9. `authenticated` sees only `published` version/asset rows.
10. `authenticated` cannot read `exercise_media_asset_events` at all, and
    cannot INSERT/UPDATE/DELETE any of the three tables.
10e. Explicit privilege matrix via `has_table_privilege()`: `authenticated`
     has exactly `SELECT` on `exercise_media_versions`/`exercise_media_assets`
     (no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) and nothing at
     all on `exercise_media_asset_events` — checked against the
     Supabase-style default-privilege bootstrap described above, so this
     proves real revocation rather than an absence of grants.
11. Audit events are immutable: UPDATE and DELETE are both blocked
    unconditionally, independent of role.
12. Restrictive deletion: an exercise with media history cannot be deleted;
    a media version with audit events cannot be deleted; a media version
    *without* audit events can be deleted and correctly cascades to its own
    assets (the one deliberate CASCADE in this schema).

## Verifying the fixture is non-vacuous

Before trusting assertion 10e, the fixture's default-privilege bootstrap was
confirmed independently: applying only `00_fixture.sql` to a fresh scratch
database (i.e. *before* the migration's `REVOKE` statements run) and then
creating a throwaway table shows `authenticated` already holding all seven
privileges via `information_schema.role_table_grants` — matching a real
Supabase project's default behavior, not an artifact of this test file. Only
after that was confirmed does 10e's "authenticated has none of these" result
mean anything.

## What this does not cover

- Storage bucket behavior, signed URLs, or any upload path — out of scope
  for this sprint (no upload UI was implemented).
- The real `auth.uid()`/JWT-claims plumbing PostgREST provides on a live
  Supabase project — the fixture's `auth.uid()` stub is not exercised by
  this migration's policies (they gate on `status`, not on `user_id`), so
  it is included only for FK completeness, not because a test depends on
  it.
- Applying the migration through the actual Supabase CLI, which is not
  installed in this environment (`supabase: command not found`).
