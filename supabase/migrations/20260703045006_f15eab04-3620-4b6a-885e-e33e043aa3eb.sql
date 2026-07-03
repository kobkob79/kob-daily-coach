
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
