CREATE TABLE public.medical_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','monitoring','resolved')),
  importance text NOT NULL DEFAULT 'medium' CHECK (importance IN ('low','medium','high')),
  started_on date,
  source_type text NOT NULL DEFAULT 'user_reported' CHECK (source_type IN ('user_reported','medical_document','clinician','viora','other')),
  source_date date,
  confidence text CHECK (confidence IS NULL OR confidence IN ('low','medium','high')),
  verification_status text NOT NULL DEFAULT 'user_confirmed' CHECK (verification_status IN ('user_confirmed','document_verified','clinician_verified','unverified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_issues TO authenticated;
GRANT ALL ON public.medical_issues TO service_role;

ALTER TABLE public.medical_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own medical issues"
  ON public.medical_issues FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own medical issues"
  ON public.medical_issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medical issues"
  ON public.medical_issues FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medical issues"
  ON public.medical_issues FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX medical_issues_user_status_idx
  ON public.medical_issues (user_id, status, importance, updated_at DESC);

CREATE TRIGGER trg_medical_issues_updated_at
  BEFORE UPDATE ON public.medical_issues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();