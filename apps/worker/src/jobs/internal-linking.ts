import { recommendations, embeddings } from '@quadbot/db';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';

const internalLinkingSchema = z.object({
  suggestions: z.array(
    z.object({
      source_page: z.string(),
      target_page: z.string(),
      anchor_text: z.string(),
      placement_section: z.string(),
      expected_benefit: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
    }),
  ),
  summary: z.string(),
});

/**
 * Internal Linking Suggestions Job.
 * Finds semantically similar pages via embeddings and suggests internal links.
 */
export async function internalLinking(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'internal_linking' }, 'Internal_Linking starting');

  // Load page embeddings for this brand
  const pageEmbeddings = await db
    .select({
      id: embeddings.id,
      source_id: embeddings.source_id,
      content_preview: embeddings.content_preview,
    })
    .from(embeddings)
    .where(
      and(
        eq(embeddings.brand_id, brandId),
        eq(embeddings.source_type, 'page_content'),
        isNotNull(embeddings.embedding),
      ),
    )
    .limit(50);

  if (pageEmbeddings.length < 2) {
    logger.info(
      { jobId, brandId, embeddingsFound: pageEmbeddings.length },
      'Not enough page embeddings for internal linking, skipping',
    );
    return;
  }

  // For each page, find similar pages using cosine similarity
  const pairs: Array<{
    source_page: string;
    target_page: string;
    source_preview: string;
    target_preview: string;
    similarity: number;
  }> = [];

  const seenPairs = new Set<string>();
  const MIN_SIMILARITY = 0.75;

  for (const page of pageEmbeddings) {
    // Query for similar pages using raw SQL with pgvector
    const similar = await db.execute(sql`
      SELECT
        source_id,
        content_preview,
        1 - (embedding <=> (SELECT embedding FROM embeddings WHERE id = ${page.id})) as similarity
      FROM embeddings
      WHERE brand_id = ${brandId}
        AND source_type = 'page_content'
        AND embedding IS NOT NULL
        AND id != ${page.id}
      ORDER BY embedding <=> (SELECT embedding FROM embeddings WHERE id = ${page.id})
      LIMIT 5
    `);

    for (const row of Array.from(similar) as Array<Record<string, unknown>>) {
      const similarity = Number(row.similarity);
      if (similarity < MIN_SIMILARITY) continue;

      const targetId = String(row.source_id);
      const pairKey = [page.source_id, targetId].sort().join('::');

      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      pairs.push({
        source_page: page.source_id,
        target_page: targetId,
        source_preview: page.content_preview || '',
        target_preview: String(row.content_preview || ''),
        similarity,
      });
    }
  }

  if (pairs.length === 0) {
    logger.info({ jobId, brandId }, 'No similar page pairs found above threshold');
    return;
  }

  // Take top 10 pairs by similarity
  pairs.sort((a, b) => b.similarity - a.similarity);
  const topPairs = pairs.slice(0, 10);

  // Send to Claude for linking suggestions
  let prompt;
  try {
    prompt = await loadActivePrompt('internal_linking_v1');
  } catch {
    logger.warn({ jobId }, 'Internal linking prompt not found, skipping');
    return;
  }

  const result = await callClaude(
    prompt,
    {
      pairs_json: JSON.stringify(
        topPairs.map((p) => ({
          source_page: p.source_page,
          target_page: p.target_page,
          similarity: Math.round(p.similarity * 100) / 100,
          source_content_preview: p.source_preview.slice(0, 200),
          target_content_preview: p.target_preview.slice(0, 200),
        })),
      ),
    },
    internalLinkingSchema,
    { trackUsage: { db, brandId, jobId } },
  );

  // Create recommendations for each suggestion
  for (const suggestion of result.data.suggestions) {
    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'internal_linking',
        priority: suggestion.priority,
        title: `Add internal link: ${suggestion.source_page} → ${suggestion.target_page}`,
        body: `**Anchor text:** "${suggestion.anchor_text}"\n**Placement:** ${suggestion.placement_section}\n**Expected benefit:** ${suggestion.expected_benefit}`,
        data: {
          type: 'internal_link',
          source_page: suggestion.source_page,
          target_page: suggestion.target_page,
          anchor_text: suggestion.anchor_text,
        },
        model_meta: result.model_meta,
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'internal_linking', priority: suggestion.priority },
      `rec:${rec.id}`,
      'internal_linking',
    );
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'internal_linking',
      pairsAnalyzed: topPairs.length,
      suggestionsCreated: result.data.suggestions.length,
      durationMs: Date.now() - startTime,
    },
    'Internal_Linking completed',
  );
}
