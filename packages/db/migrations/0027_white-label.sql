-- White-Label Mode: per-brand customization settings
CREATE TABLE IF NOT EXISTS brand_whitelabel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL UNIQUE REFERENCES brands(id) ON DELETE CASCADE,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(20),
  secondary_color VARCHAR(20),
  accent_color VARCHAR(20),
  background_color VARCHAR(20),
  foreground_color VARCHAR(20),
  font_family VARCHAR(100),
  custom_domain VARCHAR(255),
  app_name VARCHAR(100),
  app_tagline VARCHAR(255),
  footer_text TEXT,
  hide_powered_by BOOLEAN NOT NULL DEFAULT FALSE,
  custom_css TEXT,
  email_from_name VARCHAR(100),
  email_from_address VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_whitelabel_brand_id ON brand_whitelabel(brand_id);
