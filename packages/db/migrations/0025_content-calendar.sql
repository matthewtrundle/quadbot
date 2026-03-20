-- Content Calendar: Add scheduling support to artifacts
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "scheduled_publish_at" timestamptz;
CREATE INDEX IF NOT EXISTS idx_artifacts_scheduled ON artifacts (scheduled_publish_at) WHERE scheduled_publish_at IS NOT NULL;
