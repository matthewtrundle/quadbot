-- Phase 4: Brand Brain (Cross-Domain Learning with Constraints)

-- Signals: reusable patterns extracted from outcomes, with TTL decay
CREATE TABLE signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  domain varchar(100) NOT NULL,         -- 'seo', 'community', 'content', 'trends'
  signal_type varchar(100) NOT NULL,    -- 'pattern', 'anti-pattern', 'threshold', 'correlation'
  title text NOT NULL,
  description text NOT NULL,
  confidence real NOT NULL,
  decay_weight real NOT NULL DEFAULT 1.0, -- decays over time, 0.0 = expired
  evidence jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,      -- default: created_at + 90 days
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_signals_brand ON signals(source_brand_id);
CREATE INDEX idx_signals_domain ON signals(domain, confidence DESC);
CREATE INDEX idx_signals_expires ON signals(expires_at);

-- Signal applications: track where signals were used and their outcomes
CREATE TABLE signal_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  target_brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES recommendations(id) ON DELETE SET NULL,
  applied_at timestamptz DEFAULT now() NOT NULL,
  outcome_positive boolean             -- null until measured
);

CREATE INDEX idx_signal_applications_signal ON signal_applications(signal_id);
CREATE INDEX idx_signal_applications_brand ON signal_applications(target_brand_id);

-- RLS
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY signals_service_role ON signals
  USING (current_setting('role') = 'service_role');

ALTER TABLE signal_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY signal_applications_service_role ON signal_applications
  USING (current_setting('role') = 'service_role');
