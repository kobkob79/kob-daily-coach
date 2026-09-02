import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260902221740_create_exercise_insights.sql", import.meta.url),
  "utf8",
);
const assertions = readFileSync(
  new URL("../supabase/tests/exercise_insights/01_assertions.sql", import.meta.url),
  "utf8",
);

for (const table of ["exercise_equipment_profiles", "exercise_insights"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}

assert.match(migration, /references public\.exercises\(id\) on delete restrict/g);
assert.match(
  migration,
  /foreign key \(equipment_profile_id, user_id, exercise_id\)[\s\S]*references public\.exercise_equipment_profiles \(id, user_id, exercise_id\)/,
);
assert.match(migration, /where equipment_profile_id is null/);
assert.match(migration, /where equipment_profile_id is not null/);
assert.match(migration, /where is_default/);
assert.match(migration, /char_length\(text_value\) between 1 and 160/);

for (const category of [
  "machine_setup",
  "working_weight",
  "technique",
  "pain_sensitivity",
  "range_of_motion",
  "other",
]) {
  assert.match(migration, new RegExp(`'${category}'`));
}

const selectPolicies = migration.match(/for select to authenticated/g) ?? [];
const insertPolicies = migration.match(/for insert to authenticated/g) ?? [];
const updatePolicies = migration.match(/for update to authenticated/g) ?? [];
const deletePolicies = migration.match(/for delete to authenticated/g) ?? [];
assert.equal(selectPolicies.length, 2);
assert.equal(insertPolicies.length, 2);
assert.equal(updatePolicies.length, 2);
assert.equal(deletePolicies.length, 2);
assert.equal((migration.match(/using \(\(select auth\.uid\(\)\) = user_id\)/g) ?? []).length, 6);
assert.equal((migration.match(/with check \(\(select auth\.uid\(\)\) = user_id\)/g) ?? []).length, 4);

for (const expected of [
  "cross-user profile reference",
  "cross-exercise profile reference",
  "second default profile",
  "duplicate profile-specific category",
  "duplicate NULL-profile category",
  "empty text",
  "whitespace text",
  "text longer than 160",
  "unknown category",
  "anon SELECT",
  "updated_at",
]) {
  assert.match(assertions, new RegExp(expected));
}

assert.doesNotMatch(migration, /security definer/i);
assert.doesNotMatch(migration, /grant .* to (public|anon)/i);

console.log(
  "My Insights data foundation: PASS (schema, integrity, RLS, grants, and SQL coverage contract)",
);
