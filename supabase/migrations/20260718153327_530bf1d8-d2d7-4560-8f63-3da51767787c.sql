
-- Weekly workout plan slots (0=Sunday .. 6=Saturday)
CREATE TABLE public.workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  template_id UUID REFERENCES public.workout_templates ON DELETE SET NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, weekday)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_plans TO authenticated;
GRANT ALL ON public.workout_plans TO service_role;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workout_plans" ON public.workout_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_workout_plans_updated BEFORE UPDATE ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Workout sessions (an actual performed workout)
CREATE TABLE public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  template_id UUID REFERENCES public.workout_templates ON DELETE SET NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','discarded')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  total_volume_kg NUMERIC,
  difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
  energy SMALLINT CHECK (energy BETWEEN 1 AND 5),
  pain TEXT CHECK (pain IN ('none','mild','significant')),
  notes TEXT,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sessions TO authenticated;
GRANT ALL ON public.workout_sessions TO service_role;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workout_sessions" ON public.workout_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_workout_sessions_updated BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_workout_sessions_user_started ON public.workout_sessions(user_id, started_at DESC);

-- Extend workout_sets with session + timing fields
ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.workout_sessions ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS planned_rest_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS actual_rest_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS overtime_seconds INTEGER;
ALTER TABLE public.workout_sets ALTER COLUMN workout_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON public.workout_sets(session_id);
