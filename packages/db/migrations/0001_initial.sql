-- Quadbot v1 Initial Schema
-- 8 core tables + RLS policies + indexes

-- Enums
DO $$ BEGIN
  CREATE TYPE mode AS ENUM ('observe', 'assist');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE action_draft_status AS ENUM ('pending', 'approved', 'rejected', 'executed_stub', 'executed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE risk AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 1. brands
CREATE TABLE IF NOT EXISTS brands (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar(255) NOT NULL,
  mode mode NOT NULL DEFAULT 'observe',
  modules_enabled jsonb DEFAULT '[]'::jsonb,
  guardrails jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. brand_integrations
CREATE TABLE IF NOT EXISTS brand_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type varchar(100) NOT NULL,
  credentials_encrypted text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. jobs
CREATE TABLE IF NOT EXISTS jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type varchar(100) NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  payload jsonb DEFAULT '{}'::jsonb,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 4. recommendations
CREATE TABLE IF NOT EXISTS recommendations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source varchar(100) NOT NULL,
  priority priority NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  model_meta jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 5. action_drafts
CREATE TABLE IF NOT EXISTS action_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  type varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  risk risk NOT NULL DEFAULT 'medium',
  guardrails_applied jsonb DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  status action_draft_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 6. action_executions
CREATE TABLE IF NOT EXISTS action_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action_draft_id uuid NOT NULL REFERENCES action_drafts(id) ON DELETE CASCADE,
  status varchar(50) NOT NULL DEFAULT 'stubbed',
  result jsonb,
  executed_at timestamptz DEFAULT now() NOT NULL
);

-- 7. outcomes
CREATE TABLE IF NOT EXISTS outcomes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  metric_name varchar(255) NOT NULL,
  metric_value_before real,
  metric_value_after real,
  delta real,
  measured_at timestamptz DEFAULT now() NOT NULL
);

-- 8. prompt_versions
CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar(255) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  system_prompt text NOT NULL,
  user_prompt_template text NOT NULL,
  model varchar(100) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brand_integrations_brand_id ON brand_integrations(brand_id);
CREATE INDEX IF NOT EXISTS idx_jobs_brand_id ON jobs(brand_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_brand_id ON recommendations(brand_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_job_id ON recommendations(job_id);
CREATE INDEX IF NOT EXISTS idx_action_drafts_brand_id ON action_drafts(brand_id);
CREATE INDEX IF NOT EXISTS idx_action_drafts_status ON action_drafts(status);
CREATE INDEX IF NOT EXISTS idx_action_drafts_recommendation_id ON action_drafts(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_action_executions_action_draft_id ON action_executions(action_draft_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_recommendation_id ON outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_name_active ON prompt_versions(name, is_active);

-- RLS Policies (service_role only)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['brands', 'brand_integrations', 'jobs', 'recommendations', 'action_drafts', 'action_executions', 'outcomes', 'prompt_versions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', tbl);
    EXECUTE format('CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
