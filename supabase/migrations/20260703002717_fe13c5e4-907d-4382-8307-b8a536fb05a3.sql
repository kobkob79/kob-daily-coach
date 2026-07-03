
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
