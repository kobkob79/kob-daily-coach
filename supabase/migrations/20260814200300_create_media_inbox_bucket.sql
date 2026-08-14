-- Viora Media Inbox
-- Private bucket where each authenticated user owns the files under <user_id>/*

INSERT INTO storage.buckets (id, name, public)
VALUES ('media-inbox', 'media-inbox', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "media-inbox owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'media-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "media-inbox owner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "media-inbox owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'media-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "media-inbox owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'media-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
