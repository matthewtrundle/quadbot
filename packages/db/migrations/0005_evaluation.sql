-- Phase 3: Metric Snapshots + Evaluation Harness

-- Metric snapshots: backbone for all evaluation
CREATE TABLE metric_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source varchar(50) NOT NULL,          -- 'gsc' | 'ads' | 'community' | 'gbp'
  metric_key varchar(100) NOT NULL,     -- 'ctr' | 'position' | 'spam_rate' | etc.
  value real NOT NULL,
  dimensions jsonb DEFAULT '{}'::jsonb, -- { page, query, campaign }
  captured_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_metric_snapshots_brand_source ON metric_snapshots(brand_id, source, captured_at DESC);
CREATE INDEX idx_metric_snapshots_key ON metric_snapshots(brand_id, metric_key, captured_at DESC);

-- Evaluation runs: periodic scoring of recommendation quality
CREATE TABLE evaluation_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_recommendations integer NOT NULL DEFAULT 0,
  acceptance_rate real,
  avg_confidence real,
  calibration_error real,              -- |predicted_confidence - actual_acceptance_rate|
  avg_outcome_delta real,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_evaluation_runs_brand ON evaluation_runs(brand_id, created_at DESC);

-- Add scoring columns to recommendations
ALTER TABLE recommendations ADD COLUMN confidence real;
ALTER TABLE recommendations ADD COLUMN evaluation_score real;

-- Add impact columns to action_drafts
ALTER TABLE action_drafts ADD COLUMN predicted_impact real;
ALTER TABLE action_drafts ADD COLUMN actual_impact real;

-- Note: RLS disabled for Neon compatibility
