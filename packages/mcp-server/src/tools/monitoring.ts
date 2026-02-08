import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  db, brands, actionDrafts, recommendations, evaluationRuns,
  signals, metricSnapshots,
} from '@quadbot/db';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export function registerMonitoringTools(server: McpServer) {
  server.tool(
    'get_brand_health',
    'Get brand health overview: pending actions, recent recommendations, evaluation scores',
    { brandId: z.string().uuid().describe('Brand UUID') },
    async ({ brandId }) => {
      const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
      if (!brand) {
        return { content: [{ type: 'text', text: 'Brand not found' }], isError: true };
      }

      const pendingActions = await db
        .select()
        .from(actionDrafts)
        .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.status, 'pending')));

      const recentRecs = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.brand_id, brandId))
        .orderBy(desc(recommendations.created_at))
        .limit(10);

      const recentEvals = await db
        .select()
        .from(evaluationRuns)
        .where(eq(evaluationRuns.brand_id, brandId))
        .orderBy(desc(evaluationRuns.created_at))
        .limit(5);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            brand,
            pending_actions_count: pendingActions.length,
            pending_actions: pendingActions,
            recent_recommendations: recentRecs,
            recent_evaluations: recentEvals,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_signals',
    'List active cross-brand signals',
    {
      domain: z.string().optional().describe('Filter by domain'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ domain, limit }) => {
      const conditions = [];
      conditions.push(gte(signals.expires_at, new Date()));
      if (domain) conditions.push(eq(signals.domain, domain));

      const results = await db
        .select()
        .from(signals)
        .where(and(...conditions))
        .orderBy(desc(signals.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'get_metric_snapshots',
    'Get time-series metric data for a brand',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      source: z.string().optional().describe('Filter by source (e.g. gsc, ga4, ads)'),
      metricKey: z.string().optional().describe('Filter by metric key'),
      limit: z.number().min(1).max(500).optional().describe('Max results (default 50)'),
    },
    async ({ brandId, source, metricKey, limit }) => {
      const conditions = [eq(metricSnapshots.brand_id, brandId)];
      if (source) conditions.push(eq(metricSnapshots.source, source));
      if (metricKey) conditions.push(eq(metricSnapshots.metric_key, metricKey));

      const results = await db
        .select()
        .from(metricSnapshots)
        .where(and(...conditions))
        .orderBy(desc(metricSnapshots.captured_at))
        .limit(limit || 50);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'get_evaluation_runs',
    'Get evaluation scoring history for a brand',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 10)'),
    },
    async ({ brandId, limit }) => {
      const results = await db
        .select()
        .from(evaluationRuns)
        .where(eq(evaluationRuns.brand_id, brandId))
        .orderBy(desc(evaluationRuns.created_at))
        .limit(limit || 10);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
