-- Dynamic workout screen (VIORA-WORKOUT-UX-006): exercises are logged by
-- weight/reps, by time (cardio, core holds, mobility/stretch), or a mix.
-- Exercise "type" itself is derived in the app from the existing
-- muscle_group/equipment columns (no schema change needed for that) — this
-- migration only adds the additional per-set fields those time-based types
-- need, plus a first batch of manual smartwatch-style metrics, alongside the
-- existing weight_kg/reps.

alter table public.workout_sets
  add column duration_seconds integer,
  add column distance_km numeric(6,2),
  add column avg_speed_kmh numeric(5,2),
  add column incline_pct numeric(4,1),
  add column avg_heart_rate smallint,
  add column max_heart_rate smallint,
  add column recovery_heart_rate smallint,
  add column calories smallint,
  add column cadence smallint,
  add column time_under_tension_seconds integer,
  add column side text,
  add column pain_level text;

alter table public.workout_sets
  add constraint workout_sets_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0),
  add constraint workout_sets_distance_km_check
    check (distance_km is null or distance_km >= 0),
  add constraint workout_sets_avg_speed_kmh_check
    check (avg_speed_kmh is null or avg_speed_kmh >= 0),
  add constraint workout_sets_incline_pct_check
    check (incline_pct is null or incline_pct between -20 and 40),
  add constraint workout_sets_avg_heart_rate_check
    check (avg_heart_rate is null or avg_heart_rate between 0 and 300),
  add constraint workout_sets_max_heart_rate_check
    check (max_heart_rate is null or max_heart_rate between 0 and 300),
  add constraint workout_sets_recovery_heart_rate_check
    check (recovery_heart_rate is null or recovery_heart_rate between 0 and 300),
  add constraint workout_sets_calories_check
    check (calories is null or calories >= 0),
  add constraint workout_sets_cadence_check
    check (cadence is null or cadence >= 0),
  add constraint workout_sets_time_under_tension_seconds_check
    check (time_under_tension_seconds is null or time_under_tension_seconds >= 0),
  add constraint workout_sets_side_check
    check (side is null or side in ('left', 'right', 'both')),
  add constraint workout_sets_pain_level_check
    check (pain_level is null or pain_level in ('none', 'mild', 'significant'));

comment on column public.workout_sets.duration_seconds is
  'Time-based sets (cardio/core/stretch): elapsed seconds, in place of reps.';
comment on column public.workout_sets.distance_km is 'Cardio sets: distance covered, in km.';
comment on column public.workout_sets.avg_speed_kmh is 'Cardio sets: average speed in km/h.';
comment on column public.workout_sets.incline_pct is 'Cardio sets: treadmill/machine incline, percent.';
comment on column public.workout_sets.avg_heart_rate is 'Average heart rate (bpm) during this set.';
comment on column public.workout_sets.max_heart_rate is 'Peak heart rate (bpm) during this set.';
comment on column public.workout_sets.recovery_heart_rate is
  'Heart rate (bpm) at a fixed point into recovery after this set.';
comment on column public.workout_sets.calories is 'Estimated calories burned during this set.';
comment on column public.workout_sets.cadence is 'Steps or pedal strokes per minute during this set.';
comment on column public.workout_sets.time_under_tension_seconds is
  'Strength sets: time under tension, in seconds.';
comment on column public.workout_sets.side is
  'Mobility/stretch sets performed on one side of the body: left, right, or both.';
comment on column public.workout_sets.pain_level is
  'Mobility/stretch sets: reported pain during the movement — none, mild, or significant.';
comment on column public.workout_sets.avg_heart_rate is
  'Manual for now; a future wearable integration can populate heart-rate/calorie/cadence fields automatically.';

alter table public.workout_template_exercises
  add column target_duration_seconds integer;

alter table public.workout_template_exercises
  add constraint workout_template_exercises_target_duration_seconds_check
    check (target_duration_seconds is null or target_duration_seconds >= 0);

comment on column public.workout_template_exercises.target_duration_seconds is
  'Planned duration in seconds for time-based (cardio/core/stretch) template exercises.';
