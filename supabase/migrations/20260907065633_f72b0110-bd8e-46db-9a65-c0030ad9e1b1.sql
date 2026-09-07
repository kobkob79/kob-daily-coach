alter table public.workout_sets
add column if not exists is_warmup boolean not null default false;

comment on column public.workout_sets.is_warmup is 'Whether this set was a warm-up set (not counted toward working volume).';