import type { Database } from '@quadbot/db';
import { metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { logger } from '../logger.js';

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ToolResult = {
  content: string;
  is_error?: boolean;
};

export type ToolContext = {
  db: Database;
  brandId: string;
};

/**
 * Tool definitions for Claude tool_use API.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_brand_metrics',
    description:
      'Fetch recent metric snapshots for a brand, optionally filtered by source and metric key. Returns the most recent values.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Filter by metric source (e.g. gsc, ga4, ads)' },
        metric_key: { type: 'string', description: 'Filter by specific metric key' },
        days: { type: 'number', description: 'How many days back to look (default: 30)' },
      },
      required: [],
    },
  },
  {
    name: 'get_past_recommendations',
    description:
      'Retrieve past recommendations for the brand, optionally filtered by source. Returns recent recommendations to avoid duplicates.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Filter by recommendation source (e.g. gsc_daily_digest, trend_scan)' },
        limit: { type: 'number', description: 'Max results to return (default: 10)' },
      },
      required: [],
    },
  },
  {
    name: 'calculate_trend',
    description: 'Run trend analysis on a numeric series. Returns slope, direction, R-squared, and projected value.',
    input_schema: {
      type: 'object',
      properties: {
        values: {
          type: 'array',
          items: { type: 'number' },
          description: 'Chronological numeric values to analyze',
        },
      },
      required: ['values'],
    },
  },
  {
    name: 'search_similar_content',
    description: 'Search the brand knowledge base for content similar to a query. Uses vector similarity search.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to find similar content' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
      required: ['query'],
    },
  },
];

/**
 * Execute a tool call and return the result.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_brand_metrics':
        return await executeGetBrandMetrics(input, context);
      case 'get_past_recommendations':
        return await executeGetPastRecommendations(input, context);
      case 'calculate_trend':
        return await executeCalculateTrend(input);
      case 'search_similar_content':
        return await executeSearchSimilarContent(input, context);
      default:
        return { content: `Unknown tool: ${toolName}`, is_error: true };
    }
  } catch (err) {
    logger.error({ toolName, err }, 'Tool execution failed');
    return { content: `Tool error: ${(err as Error).message}`, is_error: true };
  }
}

async function executeGetBrandMetrics(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const days = (input.days as number) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = context.db
    .select({
      metric_key: metricSnapshots.metric_key,
      source: metricSnapshots.source,
      value: metricSnapshots.value,
      captured_at: metricSnapshots.captured_at,
    })
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.brand_id, context.brandId), gte(metricSnapshots.captured_at, since)))
    .orderBy(desc(metricSnapshots.captured_at))
    .limit(50)
    .$dynamic();

  const rows = await query;
  return { content: JSON.stringify(rows) };
}

async function executeGetPastRecommendations(
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const limit = Math.min((input.limit as number) || 10, 20);
  const source = input.source as string | undefined;

  const conditions = [eq(recommendations.brand_id, context.brandId)];
  if (source) {
    conditions.push(eq(recommendations.source, source));
  }

  const rows = await context.db
    .select({
      id: recommendations.id,
      title: recommendations.title,
      source: recommendations.source,
      priority: recommendations.priority,
      created_at: recommendations.created_at,
    })
    .from(recommendations)
    .where(and(...conditions))
    .orderBy(desc(recommendations.created_at))
    .limit(limit);

  return { content: JSON.stringify(rows) };
}

async function executeCalculateTrend(input: Record<string, unknown>): Promise<ToolResult> {
  const values = input.values as number[];
  if (!values || values.length < 3) {
    return { content: 'Need at least 3 values for trend analysis', is_error: true };
  }

  // Inline linear regression to avoid importing from trend-analysis (config dependency)
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  const direction = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';
  const projected = slope * n + intercept;

  return {
    content: JSON.stringify({
      direction,
      slope: Math.round(slope * 1000) / 1000,
      rSquared: Math.round(rSquared * 1000) / 1000,
      projectedNextValue: Math.round(projected * 100) / 100,
      dataPoints: n,
    }),
  };
}

async function executeSearchSimilarContent(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const query = input.query as string;
  const limit = Math.min((input.limit as number) || 5, 10);

  if (!query) {
    return { content: 'Query is required', is_error: true };
  }

  try {
    // Dynamic import to avoid config validation at module load time
    const { generateEmbedding, findSimilar } = await import('./embeddings.js');
    const embedding = await generateEmbedding(query);
    const results = await findSimilar(context.db, context.brandId, embedding, limit);

    const formatted = results.map((r) => ({
      source_type: r.source_type,
      source_id: r.source_id,
      content: r.content_preview,
      similarity: Math.round(r.similarity * 1000) / 1000,
    }));

    return { content: JSON.stringify(formatted) };
  } catch (err) {
    return { content: `Vector search unavailable: ${(err as Error).message}`, is_error: true };
  }
}
