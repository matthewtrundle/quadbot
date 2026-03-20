-- GEO / AI Search Visibility tables

CREATE TABLE IF NOT EXISTS "geo_visibility_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "query" text NOT NULL,
  "platform" varchar(50) NOT NULL,
  "is_mentioned" boolean NOT NULL,
  "is_cited" boolean NOT NULL DEFAULT false,
  "position" integer,
  "snippet" text,
  "competitor_mentions" jsonb DEFAULT '[]'::jsonb,
  "raw_response" text,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_geo_brand" ON "geo_visibility_scores" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_geo_brand_platform" ON "geo_visibility_scores" ("brand_id", "platform");

CREATE TABLE IF NOT EXISTS "content_gaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "topic" varchar(255) NOT NULL,
  "competitor_url" text,
  "competitor_domain" varchar(255),
  "estimated_volume" integer,
  "difficulty" varchar(20),
  "opportunity_score" real NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "brief_artifact_id" uuid REFERENCES "artifacts"("id") ON DELETE SET NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_content_gaps_brand" ON "content_gaps" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_content_gaps_score" ON "content_gaps" ("opportunity_score");

CREATE TABLE IF NOT EXISTS "gbp_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "total_reviews" integer NOT NULL DEFAULT 0,
  "average_rating" real,
  "new_reviews_count" integer NOT NULL DEFAULT 0,
  "direction_requests" integer,
  "phone_calls" integer,
  "website_clicks" integer,
  "photo_views" integer,
  "search_impressions" integer,
  "response_rate" real,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_gbp_brand" ON "gbp_metrics" ("brand_id");

CREATE TABLE IF NOT EXISTS "gbp_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "review_id" varchar(255) NOT NULL,
  "author_name" varchar(255),
  "rating" integer NOT NULL,
  "text" text,
  "reply_text" text,
  "reply_status" varchar(20) NOT NULL DEFAULT 'pending',
  "ai_draft_reply" text,
  "sentiment" varchar(20),
  "published_at" timestamp with time zone,
  "replied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_gbp_reviews_brand" ON "gbp_reviews" ("brand_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_gbp_reviews_external" ON "gbp_reviews" ("brand_id", "review_id");
