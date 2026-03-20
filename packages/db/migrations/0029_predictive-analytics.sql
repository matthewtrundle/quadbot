-- Predictions
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL,
  predicted_value REAL NOT NULL,
  confidence REAL NOT NULL,
  prediction_date TIMESTAMPTZ NOT NULL,
  actual_value REAL,
  accuracy REAL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_brand ON predictions(brand_id);
CREATE INDEX IF NOT EXISTS idx_predictions_brand_metric ON predictions(brand_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(prediction_date);

-- Anomaly Alerts
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  current_value REAL NOT NULL,
  expected_value REAL NOT NULL,
  deviation_pct REAL NOT NULL,
  description TEXT NOT NULL,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_brand ON anomaly_alerts(brand_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomaly_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_brand_unacked ON anomaly_alerts(brand_id, is_acknowledged);
