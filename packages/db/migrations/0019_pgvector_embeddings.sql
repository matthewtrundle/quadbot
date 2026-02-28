-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table for vector search
CREATE TABLE IF NOT EXISTS "embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "source_type" varchar(100) NOT NULL,
  "source_id" uuid NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "content_preview" text,
  "embedding" vector(1536),
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_brand_source ON embeddings (brand_id, source_type);
CREATE INDEX IF NOT EXISTS idx_embeddings_source_id ON embeddings (source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings (brand_id, source_type, source_id, content_hash);
