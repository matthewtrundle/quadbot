-- Self-Improvement Engine: Capability Gap Analysis

-- Store system-generated improvement suggestions
CREATE TABLE improvement_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,  -- null = system-wide suggestion
  category varchar(100) NOT NULL,       -- 'integration', 'data_source', 'feature', 'analysis', 'automation'
  title text NOT NULL,
  description text NOT NULL,
  rationale text NOT NULL,              -- Why this would help
  expected_impact text NOT NULL,        -- What improvement would be expected
  implementation_effort varchar(20) NOT NULL,  -- 'low', 'medium', 'high'
  priority varchar(20) NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
  status varchar(50) NOT NULL DEFAULT 'pending',   -- 'pending', 'approved', 'in_progress', 'implemented', 'dismissed'
  context jsonb DEFAULT '{}'::jsonb,    -- Supporting data that led to this suggestion
  user_feedback text,                   -- Optional user notes on why approved/dismissed
  votes integer NOT NULL DEFAULT 0,     -- User upvotes
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_improvement_suggestions_brand ON improvement_suggestions(brand_id, status);
CREATE INDEX idx_improvement_suggestions_category ON improvement_suggestions(category, status);
CREATE INDEX idx_improvement_suggestions_priority ON improvement_suggestions(priority, status);

-- Track which suggestions led to actual improvements
CREATE TABLE improvement_outcomes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id uuid NOT NULL REFERENCES improvement_suggestions(id) ON DELETE CASCADE,
  implemented_at timestamptz NOT NULL,
  before_metrics jsonb NOT NULL,        -- Metrics before implementation
  after_metrics jsonb,                  -- Metrics after (filled in later)
  measured_at timestamptz,
  improvement_delta jsonb,              -- Calculated improvement
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_improvement_outcomes_suggestion ON improvement_outcomes(suggestion_id);

-- Note: RLS disabled for Neon compatibility
