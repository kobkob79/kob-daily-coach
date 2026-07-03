
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
