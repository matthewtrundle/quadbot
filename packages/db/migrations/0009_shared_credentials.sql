-- GSC Auto-Import: Shared Credentials

CREATE TABLE shared_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type varchar(100) NOT NULL,           -- 'google_oauth'
  name varchar(255) NOT NULL,           -- User-friendly name like "Matt's Google Account"
  credentials_encrypted text NOT NULL,   -- OAuth tokens (encrypted)
  config jsonb DEFAULT '{}'::jsonb,      -- { email, scopes }
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_shared_credentials_type ON shared_credentials(type);

-- Add shared_credential_id to brand_integrations for credential reuse
ALTER TABLE brand_integrations
  ADD COLUMN shared_credential_id uuid REFERENCES shared_credentials(id);

CREATE INDEX idx_brand_integrations_shared_cred ON brand_integrations(shared_credential_id);

-- Note: RLS disabled for Neon compatibility
