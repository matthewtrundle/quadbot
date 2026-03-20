CREATE TABLE IF NOT EXISTS "seasonal_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "topic" varchar(500) NOT NULL,
  "category" varchar(100),
  "peak_month" integer NOT NULL,
  "peak_start_week" integer,
  "peak_end_week" integer,
  "historical_volume" integer,
  "yoy_growth" real,
  "recommended_publish_weeks_before" integer NOT NULL DEFAULT 4,
  "content_suggestions" jsonb DEFAULT '[]'::jsonb,
  "target_keywords" jsonb DEFAULT '[]'::jsonb,
  "competitor_coverage" jsonb DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'upcoming',
  "priority_score" real,
  "source" varchar(50) NOT NULL DEFAULT 'auto',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_seasonal_topics_brand" ON "seasonal_topics" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_seasonal_topics_peak" ON "seasonal_topics" ("brand_id", "peak_month");
CREATE INDEX IF NOT EXISTS "idx_seasonal_topics_status" ON "seasonal_topics" ("brand_id", "status");
