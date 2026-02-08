ALTER TABLE recommendations
  ADD COLUMN status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dismissed', 'bookmarked')),
  ADD COLUMN dismissed_at timestamptz;
CREATE INDEX idx_recommendations_status ON recommendations (status);
CREATE INDEX idx_recommendations_status_rank ON recommendations (status, priority_rank);
