DROP INDEX IF EXISTS public.workout_sets_session_exercise_setnum_key;
CREATE UNIQUE INDEX workout_sets_session_exercise_setnum_key
  ON public.workout_sets (session_id, exercise_id, set_number);