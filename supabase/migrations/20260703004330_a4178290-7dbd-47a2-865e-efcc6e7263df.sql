
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
