-- Cardio exercises (treadmill, bike, elliptical, rower...) are logged by time,
-- not reps/weight. Add the columns needed to record a time-based set and to
-- plan a time-based template exercise, alongside the existing reps/weight ones.

alter table public.workout_sets
  add column duration_seconds integer,
  add column avg_speed_kmh numeric(5,2),
  add column max_heart_rate smallint;

alter table public.workout_sets
  add constraint workout_sets_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0),
  add constraint workout_sets_avg_speed_kmh_check
    check (avg_speed_kmh is null or avg_speed_kmh >= 0),
  add constraint workout_sets_max_heart_rate_check
    check (max_heart_rate is null or max_heart_rate between 0 and 300);

comment on column public.workout_sets.duration_seconds is
  'Time-based (cardio) sets: elapsed seconds logged for this set, in place of reps.';
comment on column public.workout_sets.avg_speed_kmh is
  'Time-based (cardio) sets: average speed in km/h for this set.';
comment on column public.workout_sets.max_heart_rate is
  'Time-based (cardio) sets: peak heart rate in bpm during this set. Manual for now; a future wearable integration can populate it automatically.';

alter table public.workout_template_exercises
  add column target_duration_seconds integer;

alter table public.workout_template_exercises
  add constraint workout_template_exercises_target_duration_seconds_check
    check (target_duration_seconds is null or target_duration_seconds >= 0);

comment on column public.workout_template_exercises.target_duration_seconds is
  'Planned duration in seconds for time-based (cardio) template exercises, in place of target_reps/target_weight_kg.';
