-- Enforce one active workout session per user at the database level.
-- Abandon any existing duplicate in-progress sessions per user, keeping the newest.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY started_at DESC) AS rn
  FROM public.workout_sessions
  WHERE status = 'in_progress'
)
UPDATE public.workout_sessions ws
SET status = 'discarded', finished_at = COALESCE(ws.finished_at, now())
FROM ranked r
WHERE ws.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_one_active_per_user
  ON public.workout_sessions (user_id)
  WHERE status = 'in_progress';