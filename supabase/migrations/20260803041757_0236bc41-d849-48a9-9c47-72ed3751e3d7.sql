CREATE POLICY "Authenticated users can read exercise assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'exercise-assets');