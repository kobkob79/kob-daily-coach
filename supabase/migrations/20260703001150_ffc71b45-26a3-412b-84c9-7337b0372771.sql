
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
