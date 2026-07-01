
-- ============ ENUMS ============
CREATE TYPE public.exercise_category AS ENUM ('push','pull','legs','core','mobility','conditioning');
CREATE TYPE public.meal_type AS ENUM ('breakfast','lunch','dinner','snack');
CREATE TYPE public.body_area AS ENUM ('neck','sciatica','ac_joint','general');
CREATE TYPE public.shift_type AS ENUM ('day','night','off');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL USING (auth.uid()=id) WITH CHECK (auth.uid()=id);

-- ============ EXERCISES (shared library + user-added) ============
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = system template
  name TEXT NOT NULL,
  category public.exercise_category NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  description TEXT,
  default_sets INT DEFAULT 3,
  default_reps INT DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;
GRANT ALL ON public.exercises TO service_role;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read exercises" ON public.exercises FOR SELECT TO authenticated USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY "insert own exercise" ON public.exercises FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "update own exercise" ON public.exercises FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "delete own exercise" ON public.exercises FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ WORKOUTS ============
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT,
  notes TEXT,
  duration_min INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.workouts (user_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;
GRANT ALL ON public.workouts TO service_role;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workouts" ON public.workouts FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE public.workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  set_number INT NOT NULL DEFAULT 1,
  reps INT,
  weight_kg NUMERIC(6,2),
  rpe NUMERIC(3,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.workout_sets (workout_id);
CREATE INDEX ON public.workout_sets (user_id, exercise_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sets TO authenticated;
GRANT ALL ON public.workout_sets TO service_role;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sets" ON public.workout_sets FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ============ NUTRITION ============
CREATE TABLE public.nutrition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal public.meal_type NOT NULL,
  food_name TEXT NOT NULL,
  calories INT,
  protein_g NUMERIC(6,2),
  carbs_g NUMERIC(6,2),
  fat_g NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.nutrition_entries (user_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_entries TO authenticated;
GRANT ALL ON public.nutrition_entries TO service_role;
ALTER TABLE public.nutrition_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own nutrition" ON public.nutrition_entries FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ============ HEALTH ============
CREATE TABLE public.health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  area public.body_area NOT NULL,
  pain_level INT CHECK (pain_level BETWEEN 0 AND 10),
  mobility_score INT CHECK (mobility_score BETWEEN 0 AND 10),
  exercises_done TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.health_logs (user_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_logs TO authenticated;
GRANT ALL ON public.health_logs TO service_role;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own health" ON public.health_logs FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ============ SHIFT CONFIG ============
CREATE TABLE public.shift_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_date DATE NOT NULL,
  anchor_shift public.shift_type NOT NULL DEFAULT 'day',
  pattern TEXT NOT NULL DEFAULT '4on4off',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_config TO authenticated;
GRANT ALL ON public.shift_config TO service_role;
ALTER TABLE public.shift_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shift" ON public.shift_config FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ============ DAILY NOTES (for AI coaching later) ============
CREATE TABLE public.daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood INT CHECK (mood BETWEEN 1 AND 10),
  sleep_hours NUMERIC(3,1),
  energy INT CHECK (energy BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_notes TO authenticated;
GRANT ALL ON public.daily_notes TO service_role;
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily" ON public.daily_notes FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ============ AUTO-CREATE PROFILE ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED EXERCISE LIBRARY ============
INSERT INTO public.exercises (owner_id, name, category, muscle_group, equipment, description, default_sets, default_reps) VALUES
(NULL,'Bench Press','push','chest','barbell','Flat barbell bench press',4,6),
(NULL,'Overhead Press','push','shoulders','barbell','Standing military press',4,5),
(NULL,'Incline Dumbbell Press','push','chest','dumbbell','Upper chest focus',3,8),
(NULL,'Dips','push','chest/triceps','bodyweight','Parallel bar dips',3,10),
(NULL,'Push-Up','push','chest','bodyweight','Standard push-up',3,15),
(NULL,'Triceps Rope Pushdown','push','triceps','cable','Elbow-locked pushdown',3,12),
(NULL,'Deadlift','pull','posterior chain','barbell','Conventional deadlift',3,5),
(NULL,'Pull-Up','pull','back','bodyweight','Full ROM pull-up',4,8),
(NULL,'Barbell Row','pull','back','barbell','Bent-over row',4,8),
(NULL,'Seated Cable Row','pull','back','cable','Neutral grip row',3,10),
(NULL,'Face Pull','pull','rear delts','cable','External rotation focus - AC joint friendly',3,15),
(NULL,'Barbell Curl','pull','biceps','barbell','Standing curl',3,10),
(NULL,'Back Squat','legs','quads','barbell','High-bar back squat',4,6),
(NULL,'Front Squat','legs','quads','barbell','Front-rack squat',3,6),
(NULL,'Romanian Deadlift','legs','hamstrings','barbell','Hinge with slight knee bend',3,8),
(NULL,'Bulgarian Split Squat','legs','quads/glutes','dumbbell','Rear-foot elevated',3,10),
(NULL,'Leg Press','legs','quads','machine','Sled press',3,12),
(NULL,'Standing Calf Raise','legs','calves','machine','Full stretch',4,15),
(NULL,'Hip Thrust','legs','glutes','barbell','Barbell hip thrust',3,10),
(NULL,'Plank','core','core','bodyweight','Front plank hold (seconds)',3,60),
(NULL,'Hanging Leg Raise','core','core','bodyweight','Strict leg raise',3,10),
(NULL,'Dead Bug','core','core','bodyweight','Contralateral - sciatica friendly',3,10),
(NULL,'Bird Dog','core','core','bodyweight','Anti-rotation - back friendly',3,10),
(NULL,'Pallof Press','core','core','cable','Anti-rotation',3,12),
(NULL,'Chin Tuck','mobility','neck','bodyweight','Neck decompression drill',2,10),
(NULL,'Neck CARs','mobility','neck','bodyweight','Controlled articular rotation',2,5),
(NULL,'McKenzie Press-Up','mobility','lower back','bodyweight','Sciatica relief press-up',2,10),
(NULL,'90/90 Hip Stretch','mobility','hips','bodyweight','Hip mobility',2,10),
(NULL,'Cat-Cow','mobility','spine','bodyweight','Spinal mobility',2,10),
(NULL,'Band Pull-Apart','mobility','shoulders','band','Scapular / AC joint warm-up',2,15),
(NULL,'Sleeper Stretch','mobility','shoulders','bodyweight','Internal rotation for AC joint',2,30),
(NULL,'Zone 2 Walk','conditioning','cardio','none','30-45 min brisk walk',1,1),
(NULL,'Assault Bike','conditioning','cardio','machine','Intervals or steady state',1,1);
