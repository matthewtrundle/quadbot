import { recommendations, artifacts, embeddings } from '@quadbot/db';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { upsertEmbedding } from '../lib/embeddings.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

const BATCH_SIZE = 50;

/**
 * Embedding Indexer Job
 * Processes unembedded recommendations and artifacts, generates vector embeddings,
 * and stores them for semantic search / RAG.
 */
export async function embeddingIndexer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'embedding_indexer' }, 'Embedding_Indexer starting');

  if (!config.VOYAGE_API_KEY && !config.OPENAI_API_KEY) {
    logger.info({ jobId, brandId }, 'No embedding API key configured, skipping');
    return;
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  // 1. Process unembedded recommendations
  const recentRecs = await db
    .select({
      id: recommendations.id,
      title: recommendations.title,
      body: recommendations.body,
      source: recommendations.source,
    })
    .from(recommendations)
    .where(eq(recommendations.brand_id, brandId))
    .orderBy(desc(recommendations.created_at))
    .limit(BATCH_SIZE);

  for (const rec of recentRecs) {
    try {
      const content = `${rec.title}\n\n${rec.body}`;
      const result = await upsertEmbedding(db, {
        brandId,
        sourceType: 'recommendation',
        sourceId: rec.id,
        content,
        metadata: { source: rec.source },
      });
      if (result.created) created++;
      else skipped++;
    } catch (err) {
      errors++;
      logger.warn({ err, recId: rec.id }, 'Failed to embed recommendation');
    }
  }

  // 2. Process unembedded artifacts
  const recentArtifacts = await db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      type: artifacts.type,
      content: artifacts.content,
    })
    .from(artifacts)
    .where(eq(artifacts.brand_id, brandId))
    .orderBy(desc(artifacts.created_at))
    .limit(BATCH_SIZE);

  for (const artifact of recentArtifacts) {
    try {
      const textContent = typeof artifact.content === 'string' ? artifact.content : JSON.stringify(artifact.content);
      const content = `${artifact.title}\n\n${textContent}`;
      const result = await upsertEmbedding(db, {
        brandId,
        sourceType: 'artifact',
        sourceId: artifact.id,
        content,
        metadata: { type: artifact.type },
      });
      if (result.created) created++;
      else skipped++;
    } catch (err) {
      errors++;
      logger.warn({ err, artifactId: artifact.id }, 'Failed to embed artifact');
    }
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'embedding_indexer',
      created,
      skipped,
      errors,
      durationMs: Date.now() - startTime,
    },
    'Embedding_Indexer completed',
  );
}
