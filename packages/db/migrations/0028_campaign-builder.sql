-- Campaign Templates
CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  vertical VARCHAR(100),
  default_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_send_days INTEGER NOT NULL DEFAULT 5,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_category ON campaign_templates(category);

-- Campaign A/B Tests
CREATE TABLE IF NOT EXISTS campaign_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  test_type VARCHAR(50) NOT NULL,
  variant_a JSONB NOT NULL,
  variant_b JSONB NOT NULL,
  split_percentage INTEGER NOT NULL DEFAULT 50,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  winner VARCHAR(10),
  variant_a_stats JSONB DEFAULT '{}'::jsonb,
  variant_b_stats JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_campaign ON campaign_ab_tests(campaign_id);
