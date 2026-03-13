-- CMS / Publishing Configuration
CREATE TABLE IF NOT EXISTS "content_publish_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "type" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "config" jsonb NOT NULL,
  "github_token_encrypted" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_publish_configs_brand ON content_publish_configs (brand_id);
