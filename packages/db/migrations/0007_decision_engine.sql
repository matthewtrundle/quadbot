-- Phase 5: Decision Engine + Playbooks

-- Scoring columns on recommendations
ALTER TABLE recommendations ADD COLUMN roi_score real;
ALTER TABLE recommendations ADD COLUMN effort_estimate varchar(20); -- 'minutes' | 'hours' | 'days'
ALTER TABLE recommendations ADD COLUMN strategic_alignment real;
ALTER TABLE recommendations ADD COLUMN priority_rank integer;
ALTER TABLE recommendations ADD COLUMN base_score real;        -- deterministic component
ALTER TABLE recommendations ADD COLUMN claude_delta real;      -- Claude's adjustment (bounded)

-- Playbooks table
CREATE TABLE playbooks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  domain varchar(100) NOT NULL,         -- 'seo', 'community', 'ads', 'content'
  trigger_conditions jsonb NOT NULL,    -- { "recommendation_source": "gsc", "priority": "high" }
  recommended_actions jsonb NOT NULL,   -- [ { "type": "content_update", "template": "..." } ]
  examples jsonb DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_playbooks_domain ON playbooks(domain, is_active);

-- Time budget setting on brands
ALTER TABLE brands ADD COLUMN time_budget_minutes_per_day integer DEFAULT 30;

-- Note: RLS disabled for Neon compatibility
