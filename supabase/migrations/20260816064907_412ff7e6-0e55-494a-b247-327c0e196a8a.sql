CREATE POLICY "exercise-assets authenticated insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'exercise-assets');

CREATE POLICY "exercise-assets authenticated update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'exercise-assets')
WITH CHECK (bucket_id = 'exercise-assets');