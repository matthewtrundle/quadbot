import { createHash } from 'node:crypto';
import { embeddings } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../logger.js';
import { config } from '../config.js';

/**
 * Generate an embedding vector for the given text.
 * Tries Voyage AI first (voyage-3-lite, 1024 dims padded to 1536),
 * falls back to OpenAI text-embedding-3-small (1536 dims).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const voyageKey = config.VOYAGE_API_KEY;
  if (voyageKey) {
    return generateVoyageEmbedding(text, voyageKey);
  }

  const openaiKey = config.OPENAI_API_KEY;
  if (openaiKey) {
    return generateOpenAIEmbedding(text, openaiKey);
  }

  throw new Error('No embedding API key configured. Set VOYAGE_API_KEY or OPENAI_API_KEY.');
}

async function generateVoyageEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'voyage-3-lite',
      input: [text],
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage AI API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data[0].embedding;

  // Pad from 1024 to 1536 dims if needed
  if (embedding.length < 1536) {
    return [...embedding, ...new Array(1536 - embedding.length).fill(0)];
  }
  return embedding;
}

async function generateOpenAIEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

/**
 * Compute SHA-256 hash for content deduplication.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Find similar embeddings by cosine distance.
 */
export async function findSimilar(
  db: Database,
  brandId: string,
  embedding: number[],
  limit: number = 5,
  sourceTypes?: string[],
): Promise<
  Array<{
    id: string;
    source_type: string;
    source_id: string;
    content_preview: string | null;
    similarity: number;
    metadata: Record<string, unknown>;
  }>
> {
  const vectorStr = `[${embedding.join(',')}]`;

  let query = sql`
    SELECT
      id,
      source_type,
      source_id,
      content_preview,
      metadata,
      1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM embeddings
    WHERE brand_id = ${brandId}
      AND embedding IS NOT NULL
  `;

  if (sourceTypes && sourceTypes.length > 0) {
    const types = sourceTypes.map((t) => `'${t}'`).join(',');
    query = sql`
      SELECT
        id,
        source_type,
        source_id,
        content_preview,
        metadata,
        1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM embeddings
      WHERE brand_id = ${brandId}
        AND embedding IS NOT NULL
        AND source_type IN (${sql.raw(types)})
    `;
  }

  query = sql`${query} ORDER BY embedding <=> ${vectorStr}::vector LIMIT ${limit}`;

  const results = await db.execute(query);
  return Array.from(results) as unknown as Array<{
    id: string;
    source_type: string;
    source_id: string;
    content_preview: string | null;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * Upsert an embedding record. Skips if content_hash is unchanged.
 */
export async function upsertEmbedding(
  db: Database,
  params: {
    brandId: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ created: boolean; id: string }> {
  const hash = contentHash(params.content);

  // Check if identical content already embedded
  const existing = await db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.brand_id, params.brandId),
        eq(embeddings.source_type, params.sourceType),
        eq(embeddings.source_id, params.sourceId),
        eq(embeddings.content_hash, hash),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { created: false, id: existing[0].id };
  }

  // Generate embedding
  const vector = await generateEmbedding(params.content);
  const preview = params.content.slice(0, 500);

  // Delete old embeddings for this source
  await db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.brand_id, params.brandId),
        eq(embeddings.source_type, params.sourceType),
        eq(embeddings.source_id, params.sourceId),
      ),
    );

  // Insert new
  const [inserted] = await db
    .insert(embeddings)
    .values({
      brand_id: params.brandId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      content_hash: hash,
      content_preview: preview,
      embedding: vector,
      metadata: params.metadata || {},
    })
    .returning({ id: embeddings.id });

  return { created: true, id: inserted.id };
}
