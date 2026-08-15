CREATE POLICY "media-inbox own read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'media-inbox' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "media-inbox own insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media-inbox' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "media-inbox own update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media-inbox' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'media-inbox' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "media-inbox own delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media-inbox' AND (storage.foldername(name))[1] = auth.uid()::text);