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

alter table public.workout_template_exercises
  add column target_duration_seconds integer;

alter table public.workout_template_exercises
  add constraint workout_template_exercises_target_duration_seconds_check
    check (target_duration_seconds is null or target_duration_seconds >= 0);