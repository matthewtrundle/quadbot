-- Phase 6: Mission Control + Artifacts

CREATE TABLE artifacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES recommendations(id) ON DELETE SET NULL,
  type varchar(100) NOT NULL,           -- 'content_brief' | 'title_variant' | 'meta_description' | etc.
  title text NOT NULL,
  content jsonb NOT NULL,               -- structured output
  version integer NOT NULL DEFAULT 1,
  parent_artifact_id uuid REFERENCES artifacts(id),
  status varchar(50) NOT NULL DEFAULT 'draft', -- 'draft' | 'approved' | 'deployed' | 'archived'
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_artifacts_brand ON artifacts(brand_id, type, status);
CREATE INDEX idx_artifacts_rec ON artifacts(recommendation_id);

-- RLS
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY artifacts_service_role ON artifacts
  USING (current_setting('role') = 'service_role');
