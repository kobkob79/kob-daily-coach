-- Viora consolidated schema for external Supabase project "viora"
-- Apply in the Supabase SQL editor, in order. Storage buckets are created at the end.

-- ===== 20260701225204_108fae11-9b87-4bfc-8ac3-0bd30667f21d.sql =====

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

-- ===== 20260701225215_b01e1512-d981-440a-9bc1-6f3d9e351cdd.sql =====
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- ===== 20260703001150_ffc71b45-26a3-412b-84c9-7337b0372771.sql =====

-- Extend nutrition_entries with meal-management fields
ALTER TABLE public.nutrition_entries
  ADD COLUMN IF NOT EXISTS meal_time time,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS biological_day date,
  ADD COLUMN IF NOT EXISTS meal_type text,
  ADD COLUMN IF NOT EXISTS foods jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Backfill biological_day from date
UPDATE public.nutrition_entries SET biological_day = date WHERE biological_day IS NULL;

-- Meal favorites (quick one-tap logging)
CREATE TABLE IF NOT EXISTS public.meal_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  default_meal_type text,
  sort_order integer NOT NULL DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_favorites TO authenticated;
GRANT ALL ON public.meal_favorites TO service_role;

ALTER TABLE public.meal_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites"
  ON public.meal_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS meal_favorites_touch ON public.meal_favorites;
CREATE TRIGGER meal_favorites_touch
BEFORE UPDATE ON public.meal_favorites
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS meal_favorites_user_idx ON public.meal_favorites(user_id, sort_order);
CREATE INDEX IF NOT EXISTS nutrition_entries_biological_day_idx ON public.nutrition_entries(user_id, biological_day);

-- ===== 20260703001205_f2b9f258-f159-4216-9fe5-ad68bea8f7a7.sql =====

CREATE POLICY "Users read own meal photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own meal photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own meal photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'meal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own meal photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'meal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== 20260703002717_fe13c5e4-907d-4382-8307-b8a536fb05a3.sql =====

-- Universal daily events (water, supplements, weight, sleep) for the Home Timeline + Smart Coach
CREATE TABLE IF NOT EXISTS public.daily_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('water','supplement','weight','sleep')),
  event_time timestamptz NOT NULL DEFAULT now(),
  event_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jerusalem')::date),
  biological_day date,
  amount numeric,
  unit text,
  label text,
  emoji text,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_events TO authenticated;
GRANT ALL ON public.daily_events TO service_role;

ALTER TABLE public.daily_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own daily_events" ON public.daily_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS daily_events_user_bio_idx
  ON public.daily_events (user_id, biological_day DESC, event_time DESC);

-- ===== 20260703004330_a4178290-7dbd-47a2-865e-efcc6e7263df.sql =====

CREATE TABLE public.ai_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory TO authenticated;
GRANT ALL ON public.ai_memory TO service_role;

ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ai memory"
  ON public.ai_memory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_ai_memory_updated_at
  BEFORE UPDATE ON public.ai_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Flip existing shift_config rows onto the new Intel 9-day cycle by default.
UPDATE public.shift_config SET pattern = 'intel_9d' WHERE pattern = '4on4off';

-- ===== 20260703013501_4f7f50f9-1d26-479d-936e-8143f13332bc.sql =====

CREATE TABLE public.vision_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_type text NOT NULL CHECK (capture_type IN ('meal','food_label','medical_document','blood_test','medication','body_progress')),
  image_path text,
  ai_status text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','processing','done','failed','skipped')),
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_captures TO authenticated;
GRANT ALL ON public.vision_captures TO service_role;

ALTER TABLE public.vision_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vision captures" ON public.vision_captures
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER vision_captures_touch
  BEFORE UPDATE ON public.vision_captures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX vision_captures_user_time_idx ON public.vision_captures (user_id, captured_at DESC);

CREATE POLICY "vision own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vision-captures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vision-captures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-captures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vision own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vision-captures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== 20260703020627_05eb58f6-d108-4c88-ae7b-69416400323a.sql =====

-- Extend profiles with rich personal data
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS current_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS target_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS protein_target_g numeric,
  ADD COLUMN IF NOT EXISTS water_target_ml numeric,
  ADD COLUMN IF NOT EXISTS calorie_target numeric,
  ADD COLUMN IF NOT EXISTS activity_level text,
  ADD COLUMN IF NOT EXISTS work_type text,
  ADD COLUMN IF NOT EXISTS personal_notes text;

-- RLS policies for own-profile edits
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Body progress photos
CREATE TABLE IF NOT EXISTS public.body_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  view_angle text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  lighting_notes text,
  distance_notes text,
  general_notes text,
  weight_kg numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_photos TO authenticated;
GRANT ALL ON public.body_photos TO service_role;

ALTER TABLE public.body_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own body photos" ON public.body_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS body_photos_user_taken_idx ON public.body_photos(user_id, taken_at DESC);

CREATE TRIGGER body_photos_updated_at BEFORE UPDATE ON public.body_photos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== 20260703020651_dd390f32-9381-4ca4-92aa-9ee839a9492f.sql =====

CREATE POLICY "Users read own profile photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own profile photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own profile photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own profile photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own body photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own body photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own body photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own body photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== 20260703045006_f15eab04-3620-4b6a-885e-e33e043aa3eb.sql =====

-- 1) Add permanent reference image to exercises
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Normalize muscle_group into canonical Hebrew groups
UPDATE public.exercises SET muscle_group = CASE
  WHEN muscle_group ILIKE '%chest%' THEN 'חזה'
  WHEN muscle_group ILIKE '%back%' OR muscle_group ILIKE '%posterior%' OR muscle_group ILIKE '%lower back%' THEN 'גב'
  WHEN muscle_group ILIKE '%quad%' OR muscle_group ILIKE '%hamstring%' OR muscle_group ILIKE '%glute%' OR muscle_group ILIKE '%calv%' OR muscle_group ILIKE '%leg%' OR muscle_group ILIKE '%hip%' THEN 'רגליים'
  WHEN muscle_group ILIKE '%shoulder%' OR muscle_group ILIKE '%delt%' THEN 'כתפיים'
  WHEN muscle_group ILIKE '%bicep%' THEN 'יד קדמית'
  WHEN muscle_group ILIKE '%tricep%' THEN 'יד אחורית'
  WHEN muscle_group ILIKE '%core%' OR muscle_group ILIKE '%abs%' OR muscle_group ILIKE '%spine%' OR muscle_group ILIKE '%neck%' THEN 'שרירי ליבה'
  WHEN muscle_group ILIKE '%cardio%' THEN 'קרדיו'
  WHEN muscle_group ILIKE '%mobility%' THEN 'מוביליטי'
  ELSE COALESCE(muscle_group, 'אחר')
END;

-- 3) Storage RLS for exercise-images bucket (private)
CREATE POLICY "exercise-images owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercise-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "exercise-images owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercise-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "exercise-images owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exercise-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "exercise-images owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercise-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 20260703051729_b49fab21-2ed8-437d-bb7b-81758b82d01f.sql =====

-- Translate common English exercise names to Hebrew and normalize muscle groups.
-- Only touches shared library rows (owner_id IS NULL) plus any user rows that
-- still hold the exact English label. Idempotent.

UPDATE public.exercises SET name = CASE lower(trim(name))
  WHEN 'chest press'          THEN 'לחיצת חזה במכונה'
  WHEN 'bench press'          THEN 'לחיצת חזה במוט'
  WHEN 'incline bench press'  THEN 'לחיצת חזה בשיפוע'
  WHEN 'dumbbell press'       THEN 'לחיצת חזה עם משקולות'
  WHEN 'chest fly'            THEN 'פרפר לחזה'
  WHEN 'pec deck'             THEN 'פרפר במכונה'
  WHEN 'push up'              THEN 'שכיבות סמיכה'
  WHEN 'push-up'              THEN 'שכיבות סמיכה'
  WHEN 'lat pulldown'         THEN 'פולי עליון'
  WHEN 'pull up'              THEN 'מתח'
  WHEN 'pull-up'              THEN 'מתח'
  WHEN 'seated row'           THEN 'חתירה בישיבה'
  WHEN 'cable row'            THEN 'חתירה בכבל'
  WHEN 'barbell row'          THEN 'חתירה במוט'
  WHEN 'dumbbell row'         THEN 'חתירה חד־ידית'
  WHEN 'deadlift'             THEN 'דדליפט'
  WHEN 'romanian deadlift'    THEN 'דדליפט רומני'
  WHEN 'shoulder press'       THEN 'לחיצת כתפיים'
  WHEN 'overhead press'       THEN 'לחיצת כתפיים במוט'
  WHEN 'lateral raise'        THEN 'הרחקת כתפיים'
  WHEN 'front raise'          THEN 'הרמות קדמיות'
  WHEN 'rear delt fly'        THEN 'פרפר אחורי'
  WHEN 'bicep curl'           THEN 'כפיפת מרפקים'
  WHEN 'biceps curl'          THEN 'כפיפת מרפקים'
  WHEN 'hammer curl'          THEN 'כפיפת פטיש'
  WHEN 'tricep pushdown'      THEN 'פשיטת מרפקים בפולי'
  WHEN 'triceps pushdown'     THEN 'פשיטת מרפקים בפולי'
  WHEN 'tricep extension'     THEN 'פשיטת מרפקים'
  WHEN 'leg press'            THEN 'לחיצת רגליים'
  WHEN 'leg extension'        THEN 'פשיטת ברכיים'
  WHEN 'leg curl'             THEN 'כפיפת ברכיים'
  WHEN 'squat'                THEN 'סקוואט'
  WHEN 'back squat'           THEN 'סקוואט אחורי'
  WHEN 'front squat'          THEN 'סקוואט קדמי'
  WHEN 'goblet squat'         THEN 'סקוואט גביע'
  WHEN 'lunge'                THEN 'לאנג׳'
  WHEN 'walking lunge'        THEN 'לאנג׳ בהליכה'
  WHEN 'hip thrust'           THEN 'היפ ת׳ראסט'
  WHEN 'calf raise'           THEN 'הרמת עקבים'
  WHEN 'seated calf raise'    THEN 'הרמת עקבים בישיבה'
  WHEN 'plank'                THEN 'פלאנק'
  WHEN 'side plank'           THEN 'פלאנק צד'
  WHEN 'sit up'               THEN 'כפיפות בטן'
  WHEN 'crunch'               THEN 'כפיפות בטן'
  WHEN 'hanging leg raise'    THEN 'הרמת רגליים בתלייה'
  WHEN 'russian twist'        THEN 'טוויסט רוסי'
  WHEN 'treadmill'            THEN 'הליכון'
  WHEN 'stationary bike'      THEN 'אופני כושר'
  WHEN 'elliptical'           THEN 'אליפטיקל'
  WHEN 'rowing machine'       THEN 'ארגומטר חתירה'
  WHEN 'stretching'           THEN 'מתיחות'
  WHEN 'mobility'             THEN 'תרגילי מוביליטי'
  ELSE name
END
WHERE lower(trim(name)) IN (
  'chest press','bench press','incline bench press','dumbbell press','chest fly','pec deck',
  'push up','push-up','lat pulldown','pull up','pull-up','seated row','cable row','barbell row',
  'dumbbell row','deadlift','romanian deadlift','shoulder press','overhead press','lateral raise',
  'front raise','rear delt fly','bicep curl','biceps curl','hammer curl','tricep pushdown',
  'triceps pushdown','tricep extension','leg press','leg extension','leg curl','squat',
  'back squat','front squat','goblet squat','lunge','walking lunge','hip thrust','calf raise',
  'seated calf raise','plank','side plank','sit up','crunch','hanging leg raise','russian twist',
  'treadmill','stationary bike','elliptical','rowing machine','stretching','mobility'
);

-- Seed a shared Hebrew starter library (owner_id NULL = visible to all users).
-- Skip inserts whose Hebrew name already exists to keep this migration idempotent.
INSERT INTO public.exercises (name, muscle_group, category, owner_id)
SELECT v.name, v.muscle_group, 'core', NULL
FROM (VALUES
  ('לחיצת חזה במכונה','חזה'),
  ('לחיצת חזה במוט','חזה'),
  ('פרפר לחזה','חזה'),
  ('שכיבות סמיכה','חזה'),
  ('פולי עליון','גב'),
  ('חתירה בישיבה','גב'),
  ('חתירה במוט','גב'),
  ('מתח','גב'),
  ('דדליפט','גב'),
  ('לחיצת כתפיים','כתפיים'),
  ('הרחקת כתפיים','כתפיים'),
  ('הרמות קדמיות','כתפיים'),
  ('פרפר אחורי','כתפיים'),
  ('כפיפת מרפקים','יד קדמית'),
  ('כפיפת פטיש','יד קדמית'),
  ('פשיטת מרפקים בפולי','יד אחורית'),
  ('פשיטת מרפקים','יד אחורית'),
  ('סקוואט','רגליים'),
  ('לחיצת רגליים','רגליים'),
  ('פשיטת ברכיים','רגליים'),
  ('כפיפת ברכיים','רגליים'),
  ('לאנג׳','רגליים'),
  ('היפ ת׳ראסט','רגליים'),
  ('הרמת עקבים','רגליים'),
  ('פלאנק','שרירי ליבה'),
  ('כפיפות בטן','בטן'),
  ('הרמת רגליים בתלייה','בטן'),
  ('טוויסט רוסי','שרירי ליבה'),
  ('הליכון','קרדיו'),
  ('אופני כושר','קרדיו'),
  ('אליפטיקל','קרדיו'),
  ('ארגומטר חתירה','קרדיו'),
  ('מתיחות','מוביליטי'),
  ('תרגילי מוביליטי','מוביליטי')
) AS v(name, muscle_group)
WHERE NOT EXISTS (
  SELECT 1 FROM public.exercises e
  WHERE e.name = v.name AND e.owner_id IS NULL
);

-- ===== 20260703062447_4acc658a-d2ca-428a-841b-204beed96b9e.sql =====
ALTER TABLE public.nutrition_entries ADD COLUMN IF NOT EXISTS fiber_g numeric;
-- ===== 20260707043631_7e346300-7a67-4ace-b324-4ed6ccb53d5d.sql =====

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

-- ===== 20260711034221_4930e38c-3d08-41ba-9051-65b039a70629.sql =====

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS life_context text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0;

ALTER TABLE public.shift_config
  ADD COLUMN IF NOT EXISTS cycle_length integer,
  ADD COLUMN IF NOT EXISTS day_shifts integer,
  ADD COLUMN IF NOT EXISTS night_shifts integer,
  ADD COLUMN IF NOT EXISTS off_days integer;

-- ===== 20260712053826_ba9f1b67-37c2-452d-9f14-516e12a8df8d.sql =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS workplace text,
  ADD COLUMN IF NOT EXISTS job_title text;
-- ===== 20260718153327_530bf1d8-d2d7-4560-8f63-3da51767787c.sql =====

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

-- ===== 20260720030050_806b5162-6438-4309-a2c2-b59a35cc8eeb.sql =====
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
-- ===== 20260727053648_95863b23-1c9e-4002-8fbc-e1ba39aaa28d.sql =====
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS plan_weekday smallint;
COMMENT ON COLUMN public.workout_sessions.plan_weekday IS 'Weekly plan occurrence (0=Sunday) this session was started from. Null for legacy sessions.';
-- ===== 20260801040218_1a2116a0-34b4-4a2e-a68a-bd5fb08d260f.sql =====
-- body_measurements
CREATE TABLE public.body_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_on date NOT NULL DEFAULT CURRENT_DATE,
  area text NOT NULL,
  value_cm numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_measurements TO authenticated;
GRANT ALL ON public.body_measurements TO service_role;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own body_measurements" ON public.body_measurements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- weights_history
CREATE TABLE public.weights_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_on date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weights_history TO authenticated;
GRANT ALL ON public.weights_history TO service_role;
ALTER TABLE public.weights_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own weights_history" ON public.weights_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- goals
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  target_value numeric,
  target_unit text,
  target_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_recommendations
CREATE TABLE public.ai_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  reasoning text,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  related jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_recommendations TO authenticated;
GRANT ALL ON public.ai_recommendations TO service_role;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai_recommendations" ON public.ai_recommendations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER trg_body_measurements_updated BEFORE UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_weights_history_updated BEFORE UPDATE ON public.weights_history FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ai_recommendations_updated BEFORE UPDATE ON public.ai_recommendations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- indexes
CREATE INDEX idx_body_measurements_user_date ON public.body_measurements(user_id, measured_on DESC);
CREATE INDEX idx_weights_history_user_date ON public.weights_history(user_id, measured_on DESC);
CREATE INDEX idx_goals_user_status ON public.goals(user_id, status);
CREATE INDEX idx_ai_recommendations_user_created ON public.ai_recommendations(user_id, created_at DESC);
-- ===== storage buckets =====
insert into storage.buckets (id, name, public) values
  ('body-photos','body-photos',false),
  ('exercise-images','exercise-images',false),
  ('meal-photos','meal-photos',false),
  ('profile-photos','profile-photos',false),
  ('vision-captures','vision-captures',false)
on conflict (id) do nothing;

-- owner-scoped storage policies (path prefix = auth.uid())
do $$
declare b text;
begin
  foreach b in array array['body-photos','exercise-images','meal-photos','profile-photos','vision-captures'] loop
    execute format($f$
      create policy %L on storage.objects for all to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $f$, b || '_owner_all', b, b);
  end loop;
end $$;

-- auth trigger for profiles (auth schema trigger must be created by the project owner)
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
