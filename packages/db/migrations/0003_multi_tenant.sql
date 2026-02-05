-- Phase 1: Multi-Tenant Hardening
-- API keys table for per-brand authentication

CREATE TABLE api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  key_hash varchar(64) NOT NULL,        -- SHA-256 hash
  key_prefix varchar(8) NOT NULL,       -- first 8 chars for display
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_api_keys_brand ON api_keys(brand_id);
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_service_role ON api_keys
  USING (current_setting('role') = 'service_role');
