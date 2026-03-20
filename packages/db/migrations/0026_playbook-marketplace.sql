-- Playbook Marketplace: Templates & Installs

CREATE TABLE IF NOT EXISTS playbook_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  vertical VARCHAR(100),
  trigger_type VARCHAR(100) NOT NULL,
  trigger_conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  tags JSONB NOT NULL DEFAULT '[]',
  author_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  author_name VARCHAR(255),
  is_official BOOLEAN NOT NULL DEFAULT false,
  install_count INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON playbook_templates(category);
CREATE UNIQUE INDEX idx_templates_slug ON playbook_templates(slug);
CREATE INDEX idx_templates_vertical ON playbook_templates(vertical);

CREATE TABLE IF NOT EXISTS playbook_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES playbook_templates(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  playbook_id UUID REFERENCES playbooks(id) ON DELETE SET NULL,
  rating INTEGER,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_installs_template ON playbook_installs(template_id);
CREATE INDEX idx_installs_brand ON playbook_installs(brand_id);
CREATE UNIQUE INDEX idx_installs_template_brand ON playbook_installs(template_id, brand_id);
