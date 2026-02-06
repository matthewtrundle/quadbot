-- Phase 2: Event-Driven Architecture
-- Events table with idempotency + processing state

CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type varchar(100) NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  source varchar(100),                  -- originating job type or 'api'
  dedupe_key text,                      -- idempotency guard
  status varchar(20) NOT NULL DEFAULT 'new',  -- new | processed | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX idx_events_dedupe ON events(brand_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_events_status ON events(status, created_at);
CREATE INDEX idx_events_brand ON events(brand_id, type, created_at DESC);

-- Event rules: map event types to job types
CREATE TABLE event_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE, -- null = global rule
  event_type varchar(100) NOT NULL,
  job_type varchar(100) NOT NULL,
  conditions jsonb DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_event_rules_type ON event_rules(event_type, enabled);
CREATE INDEX idx_event_rules_brand ON event_rules(brand_id);

-- Note: RLS disabled for Neon compatibility
