import { generateEmbedding, findSimilar } from './embeddings.js';
import type { Database } from '@quadbot/db';
import { logger } from '../logger.js';

export type RAGContext = {
  chunks: Array<{
    content: string;
    source_type: string;
    source_id: string;
    similarity: number;
  }>;
  totalChunks: number;
  formatted: string;
};

export type RetrieveContextOptions = {
  brandId: string;
  query: string;
  sourceTypes?: string[];
  maxChunks?: number;
  minSimilarity?: number;
};

/**
 * Retrieve relevant context from the embedding store for a brand.
 * Returns formatted context string suitable for injection into Claude system prompt.
 */
export async function retrieveContext(db: Database, options: RetrieveContextOptions): Promise<RAGContext | null> {
  const { brandId, query, sourceTypes, maxChunks = 5, minSimilarity = 0.3 } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);
    const results = await findSimilar(db, brandId, queryEmbedding, maxChunks + 5, sourceTypes);

    // Filter by minimum similarity
    const relevant = results.filter((r) => r.similarity >= minSimilarity).slice(0, maxChunks);

    if (relevant.length === 0) {
      logger.debug({ brandId, query: query.slice(0, 100) }, 'No relevant RAG context found');
      return null;
    }

    const chunks = relevant.map((r) => ({
      content: r.content_preview || '',
      source_type: r.source_type,
      source_id: r.source_id,
      similarity: Math.round(r.similarity * 1000) / 1000,
    }));

    // Format as context block for Claude
    const formatted = formatRAGContext(chunks);

    logger.info(
      { brandId, queryLen: query.length, chunksRetrieved: chunks.length, topSimilarity: chunks[0]?.similarity },
      'RAG context retrieved',
    );

    return { chunks, totalChunks: chunks.length, formatted };
  } catch (err) {
    logger.warn({ brandId, err }, 'Failed to retrieve RAG context (non-fatal)');
    return null;
  }
}

function formatRAGContext(
  chunks: Array<{ content: string; source_type: string; source_id: string; similarity: number }>,
): string {
  if (chunks.length === 0) return '';

  const lines = chunks.map(
    (c, i) => `[${i + 1}] (${c.source_type}/${c.source_id}, relevance: ${c.similarity})\n${c.content}`,
  );

  return `## Retrieved Brand Knowledge\nThe following context was retrieved from the brand's knowledge base. Use it to ground your analysis.\n\n${lines.join('\n\n')}`;
}
