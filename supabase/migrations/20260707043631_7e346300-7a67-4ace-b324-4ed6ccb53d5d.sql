
CREATE TABLE public.workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_templates TO authenticated;
GRANT ALL ON public.workout_templates TO service_role;
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own templates" ON public.workout_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_workout_templates_updated
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.workout_template_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  target_sets integer NOT NULL DEFAULT 3,
  target_reps integer,
  target_weight_kg numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_template_exercises TO authenticated;
GRANT ALL ON public.workout_template_exercises TO service_role;
ALTER TABLE public.workout_template_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own template exercises" ON public.workout_template_exercises FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.workout_template_exercises (template_id, position);
