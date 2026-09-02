# Exercise Insights data-foundation SQL tests

These tests validate the schema, constraints, RLS ownership boundaries,
explicit grants and `updated_at` behavior in a disposable PostgreSQL database.
They never connect to a remote Supabase project.

The fixture recreates only the Supabase platform objects needed by the new
migration: roles, `auth.users`, `auth.uid()`, `public.exercises`, and
`public.touch_updated_at()`. It also reproduces Supabase's legacy automatic
table grants so the migration's explicit revocations are tested rather than
passing vacuously.

```bash
createdb viora_exercise_insights_test
psql -d viora_exercise_insights_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_insights/00_fixture.sql
psql -d viora_exercise_insights_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260902221740_create_exercise_insights.sql
psql -d viora_exercise_insights_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/exercise_insights/01_assertions.sql
dropdb viora_exercise_insights_test
```

The assertions cover owner-scoped reads and writes, composite profile scope,
default-profile uniqueness, both profiled and NULL-profile insight uniqueness,
all category/text constraints, timestamps, anonymous denial, privileges and
restrictive exercise deletion. They also execute hostile ownership inserts,
updates and deletes, verify the protected rows remain unchanged, block moving a
referenced profile to another exercise, and verify supporting foreign-key indexes.
