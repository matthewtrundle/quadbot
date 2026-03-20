import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  // Fetch the most recent search_query_miner recommendations
  const recs = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.brand_id, brandId), eq(recommendations.source, 'search_query_miner')))
    .orderBy(desc(recommendations.created_at))
    .limit(20);

  // Extract structured data from recommendation data JSONB
  const opportunities: Array<{
    query: string;
    current_position: number;
    impressions: number;
    ctr: number;
    potential_gain: number;
    type: string;
    recommendation: string;
  }> = [];

  const negativeKeywords: Array<{
    query: string;
    reason: string;
    wasted_clicks: number;
  }> = [];

  const clusters: Array<{
    theme: string;
    queries: string[];
    total_impressions: number;
    content_suggestion: string;
  }> = [];

  for (const rec of recs) {
    const data = (rec.data ?? {}) as Record<string, unknown>;

    // Each recommendation may contain opportunities, negatives, and clusters
    if (Array.isArray(data.opportunities)) {
      for (const opp of data.opportunities as Array<Record<string, unknown>>) {
        opportunities.push({
          query: (opp.query as string) ?? '',
          current_position: (opp.current_position as number) ?? 0,
          impressions: (opp.impressions as number) ?? 0,
          ctr: (opp.ctr as number) ?? 0,
          potential_gain: (opp.potential_gain as number) ?? 0,
          type: (opp.type as string) ?? 'optimize_position',
          recommendation: (opp.recommendation as string) ?? rec.body,
        });
      }
    }

    if (Array.isArray(data.negative_keywords)) {
      for (const nk of data.negative_keywords as Array<Record<string, unknown>>) {
        negativeKeywords.push({
          query: (nk.query as string) ?? '',
          reason: (nk.reason as string) ?? '',
          wasted_clicks: (nk.wasted_clicks as number) ?? 0,
        });
      }
    }

    if (Array.isArray(data.clusters)) {
      for (const cl of data.clusters as Array<Record<string, unknown>>) {
        clusters.push({
          theme: (cl.theme as string) ?? '',
          queries: (cl.queries as string[]) ?? [],
          total_impressions: (cl.total_impressions as number) ?? 0,
          content_suggestion: (cl.content_suggestion as string) ?? '',
        });
      }
    }
  }

  return NextResponse.json({
    opportunities,
    negativeKeywords,
    clusters,
    summary: {
      opportunitiesFound: opportunities.length,
      negativeKeywordsFound: negativeKeywords.length,
      clustersFound: clusters.length,
    },
  });
}
