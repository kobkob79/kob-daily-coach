
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
