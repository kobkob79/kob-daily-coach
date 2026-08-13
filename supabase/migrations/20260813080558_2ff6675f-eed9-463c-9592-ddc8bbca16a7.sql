-- Nutrient Foundation parity migration (idempotent).
-- Represents the already-live schema so repo + DB agree. Creates nothing that exists.

CREATE TABLE IF NOT EXISTS public.nutrient_definitions (
  key text PRIMARY KEY,
  canonical_name text NOT NULL,
  display_name_he text NOT NULL,
  default_unit text NOT NULL,
  category text NOT NULL,
  sort_order integer NOT NULL DEFAULT 999,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nutrition_entry_nutrients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nutrition_entry_id uuid NOT NULL REFERENCES public.nutrition_entries(id) ON DELETE CASCADE,
  nutrient_key text NOT NULL REFERENCES public.nutrient_definitions(key),
  amount numeric,
  estimated_min numeric,
  estimated_max numeric,
  unit text NOT NULL,
  source_type text NOT NULL DEFAULT 'user_entered',
  source_ref text,
  confidence text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nutrition_nutrient_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nutrient_key text NOT NULL REFERENCES public.nutrient_definitions(key),
  target_amount numeric NOT NULL,
  unit text NOT NULL,
  target_type text NOT NULL,
  upper_limit numeric,
  source_ref text NOT NULL,
  reason text,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nutrient_definitions TO authenticated;
GRANT ALL ON public.nutrient_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_entry_nutrients TO authenticated;
GRANT ALL ON public.nutrition_entry_nutrients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_nutrient_targets TO authenticated;
GRANT ALL ON public.nutrition_nutrient_targets TO service_role;

ALTER TABLE public.nutrient_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_entry_nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_nutrient_targets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrient_definitions' AND policyname='Authenticated users can view nutrient definitions') THEN
    CREATE POLICY "Authenticated users can view nutrient definitions" ON public.nutrient_definitions FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_entry_nutrients' AND policyname='Users can view their own nutrition entry nutrients') THEN
    CREATE POLICY "Users can view their own nutrition entry nutrients" ON public.nutrition_entry_nutrients FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_entry_nutrients' AND policyname='Users can create their own nutrition entry nutrients') THEN
    CREATE POLICY "Users can create their own nutrition entry nutrients" ON public.nutrition_entry_nutrients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_entry_nutrients' AND policyname='Users can update their own nutrition entry nutrients') THEN
    CREATE POLICY "Users can update their own nutrition entry nutrients" ON public.nutrition_entry_nutrients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_entry_nutrients' AND policyname='Users can delete their own nutrition entry nutrients') THEN
    CREATE POLICY "Users can delete their own nutrition entry nutrients" ON public.nutrition_entry_nutrients FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_nutrient_targets' AND policyname='Users can view their own nutrient targets') THEN
    CREATE POLICY "Users can view their own nutrient targets" ON public.nutrition_nutrient_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_nutrient_targets' AND policyname='Users can create their own nutrient targets') THEN
    CREATE POLICY "Users can create their own nutrient targets" ON public.nutrition_nutrient_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_nutrient_targets' AND policyname='Users can update their own nutrient targets') THEN
    CREATE POLICY "Users can update their own nutrient targets" ON public.nutrition_nutrient_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_nutrient_targets' AND policyname='Users can delete their own nutrient targets') THEN
    CREATE POLICY "Users can delete their own nutrient targets" ON public.nutrition_nutrient_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nutrition_entry_nutrients_entry_idx ON public.nutrition_entry_nutrients (nutrition_entry_id);
CREATE INDEX IF NOT EXISTS nutrition_entry_nutrients_user_idx ON public.nutrition_entry_nutrients (user_id);
CREATE INDEX IF NOT EXISTS nutrition_nutrient_targets_user_active_idx ON public.nutrition_nutrient_targets (user_id, nutrient_key, is_active);