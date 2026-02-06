-- Phase 5: Learning Loop Enhancement Tables

-- prompt_performance: tracks effectiveness_score per prompt_version per period
CREATE TABLE IF NOT EXISTS prompt_performance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_version_id uuid NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_recommendations integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  acceptance_rate real,
  avg_outcome_delta real,
  confidence_accuracy real,
  effectiveness_score real,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- execution_rules: per-brand rules for v2 auto-execute bridge
CREATE TABLE IF NOT EXISTS execution_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  min_confidence real NOT NULL DEFAULT 0.9,
  max_risk varchar(10) NOT NULL DEFAULT 'low',
  allowed_action_types jsonb DEFAULT '[]'::jsonb,
  auto_execute boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_performance_version ON prompt_performance(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_prompt_performance_period ON prompt_performance(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_execution_rules_brand_id ON execution_rules(brand_id);

-- Note: RLS disabled for Neon compatibility
