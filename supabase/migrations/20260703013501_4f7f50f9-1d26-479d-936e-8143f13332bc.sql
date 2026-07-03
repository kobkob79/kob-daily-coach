
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
