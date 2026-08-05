-- 1. Remove duplicated planned sets, keeping the best row per (session, exercise, set_number)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY session_id, exercise_id, set_number
           ORDER BY (completed_at IS NOT NULL) DESC, completed_at ASC, created_at ASC, id ASC
         ) AS rn
  FROM public.workout_sets
  WHERE session_id IS NOT NULL
)
DELETE FROM public.workout_sets ws
USING ranked r
WHERE ws.id = r.id AND r.rn > 1;

-- 2. Structural guarantee: set generation is idempotent
CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_session_exercise_setnum_key
  ON public.workout_sets (session_id, exercise_id, set_number)
  WHERE session_id IS NOT NULL;