-- WORKOUT-010: mark a set as a warm-up so it can be excluded from PRs,
-- volume totals and progression stats without deleting it from history.
alter table public.workout_sets
  add column is_warmup boolean not null default false;
