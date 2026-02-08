-- Add performance indexes to frequently queried tables

-- Jobs: status filtering, per-brand status, per-brand date ordering
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_brand_status ON jobs (brand_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_brand_created ON jobs (brand_id, created_at);

-- Recommendations: per-brand date ordering, per-brand source filtering
CREATE INDEX IF NOT EXISTS idx_recommendations_brand_created ON recommendations (brand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_brand_source ON recommendations (brand_id, source);

-- Action Drafts: status filtering, per-brand status
CREATE INDEX IF NOT EXISTS idx_action_drafts_status ON action_drafts (status);
CREATE INDEX IF NOT EXISTS idx_action_drafts_brand_status ON action_drafts (brand_id, status);

-- Events: status filtering, per-brand type, deduplication
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_brand_type ON events (brand_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedupe ON events (brand_id, type, dedupe_key);

-- Brand Integrations: brand + type lookup
CREATE INDEX IF NOT EXISTS idx_brand_integrations_brand_type ON brand_integrations (brand_id, type);

-- Metric Snapshots: per-brand source, per-brand date ordering
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_brand_source ON metric_snapshots (brand_id, source);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_brand_captured ON metric_snapshots (brand_id, captured_at);
