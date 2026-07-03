
CREATE POLICY "Users read own profile photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own profile photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own profile photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own profile photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own body photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own body photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own body photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own body photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
