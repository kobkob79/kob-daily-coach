CREATE TABLE IF NOT EXISTS public.workout_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  plan_weekday smallint,
  display_name text,
  status text NOT NULL DEFAULT 'planned',
  session_id uuid REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
  completed_at timestamptz,
  skipped_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_instances_status_chk CHECK (status IN ('planned','active','partial','completed','skipped')),
  CONSTRAINT workout_instances_weekday_chk CHECK (plan_weekday IS NULL OR (plan_weekday >= 0 AND plan_weekday <= 6))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_instances TO authenticated;
GRANT ALL ON public.workout_instances TO service_role;

ALTER TABLE public.workout_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workout instances"
  ON public.workout_instances FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS workout_instances_user_date_idx
  ON public.workout_instances (user_id, scheduled_date);

CREATE UNIQUE INDEX IF NOT EXISTS workout_instances_slot_key
  ON public.workout_instances (user_id, scheduled_date, plan_weekday)
  WHERE plan_weekday IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workout_instances_session_key
  ON public.workout_instances (session_id)
  WHERE session_id IS NOT NULL;

CREATE TRIGGER trg_workout_instances_updated
  BEFORE UPDATE ON public.workout_instances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.workout_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_sessions_instance_idx
  ON public.workout_sessions (instance_id);

-- Conservative backfill. Reliable identifier: plan_weekday (written at start time).
-- Heuristic (migration only): scheduled_date = the plan_weekday date inside the
-- week the session was started; when plan_weekday IS NULL, scheduled_date =
-- date(started_at). Only in_progress/completed sessions are backfilled.
WITH src AS (
  SELECT s.id,
         s.user_id,
         s.template_id,
         s.plan_weekday,
         s.name,
         s.status,
         s.finished_at,
         CASE
           WHEN s.plan_weekday IS NOT NULL
             THEN (date_trunc('day', s.started_at)::date
                   - EXTRACT(DOW FROM s.started_at)::int
                   + s.plan_weekday)
           ELSE date_trunc('day', s.started_at)::date
         END AS scheduled_date
  FROM public.workout_sessions s
  WHERE s.status IN ('in_progress','completed')
), ins AS (
  INSERT INTO public.workout_instances
    (user_id, scheduled_date, template_id, plan_weekday, display_name, status, session_id, completed_at, created_at)
  SELECT src.user_id,
         src.scheduled_date,
         src.template_id,
         src.plan_weekday,
         src.name,
         CASE WHEN src.status = 'completed' THEN 'completed' ELSE 'active' END,
         src.id,
         CASE WHEN src.status = 'completed' THEN src.finished_at ELSE NULL END,
         now()
  FROM src
  ON CONFLICT DO NOTHING
  RETURNING id, session_id
)
UPDATE public.workout_sessions s
SET instance_id = ins.id
FROM ins
WHERE s.id = ins.session_id;