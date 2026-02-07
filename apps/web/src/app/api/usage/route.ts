import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recommendations, brands } from '@quadbot/db';
import { eq, gte, desc, sql, and, isNotNull } from 'drizzle-orm';

// Anthropic pricing (per 1M tokens) as of 2024
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model?: string,
): number {
  const pricing = model && PRICING[model] ? PRICING[model] : DEFAULT_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return new Date(0); // Beginning of time
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || '7d';
  const periodStart = getPeriodStart(period);

  try {
    // Get all recommendations with model_meta in the period
    const recsWithMeta = await db
      .select({
        id: recommendations.id,
        brand_id: recommendations.brand_id,
        brand_name: brands.name,
        source: recommendations.source,
        title: recommendations.title,
        model_meta: recommendations.model_meta,
        created_at: recommendations.created_at,
      })
      .from(recommendations)
      .innerJoin(brands, eq(recommendations.brand_id, brands.id))
      .where(
        and(
          gte(recommendations.created_at, periodStart),
          isNotNull(recommendations.model_meta),
        ),
      )
      .orderBy(desc(recommendations.created_at));

    // Process the data
    let totalCalls = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    const bySource: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
    const byBrand: Record<string, { brand_name: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
    const byModel: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};

    const recentActivity: Array<{
      id: string;
      source: string;
      brand_name: string;
      title: string;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      created_at: string;
    }> = [];

    for (const rec of recsWithMeta) {
      const meta = rec.model_meta as {
        input_tokens?: number;
        output_tokens?: number;
        model?: string;
      } | null;

      if (!meta) continue;

      const inputTokens = meta.input_tokens || 0;
      const outputTokens = meta.output_tokens || 0;
      const model = meta.model || 'unknown';
      const cost = calculateCost(inputTokens, outputTokens, model);

      totalCalls++;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCost += cost;

      // By source
      if (!bySource[rec.source]) {
        bySource[rec.source] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      }
      bySource[rec.source].calls++;
      bySource[rec.source].input_tokens += inputTokens;
      bySource[rec.source].output_tokens += outputTokens;
      bySource[rec.source].cost_usd += cost;

      // By brand
      if (!byBrand[rec.brand_id]) {
        byBrand[rec.brand_id] = { brand_name: rec.brand_name, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      }
      byBrand[rec.brand_id].calls++;
      byBrand[rec.brand_id].input_tokens += inputTokens;
      byBrand[rec.brand_id].output_tokens += outputTokens;
      byBrand[rec.brand_id].cost_usd += cost;

      // By model
      if (!byModel[model]) {
        byModel[model] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      }
      byModel[model].calls++;
      byModel[model].input_tokens += inputTokens;
      byModel[model].output_tokens += outputTokens;
      byModel[model].cost_usd += cost;

      // Recent activity (first 20)
      if (recentActivity.length < 20) {
        recentActivity.push({
          id: rec.id,
          source: rec.source,
          brand_name: rec.brand_name,
          title: rec.title,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: cost,
          created_at: rec.created_at.toISOString(),
        });
      }
    }

    // Convert maps to arrays and sort by cost
    const bySourceArray = Object.entries(bySource)
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    const byBrandArray = Object.entries(byBrand)
      .map(([brand_id, data]) => ({ brand_id, ...data }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    const byModelArray = Object.entries(byModel)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    return NextResponse.json({
      summary: {
        total_calls: totalCalls,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost_usd: totalCost,
        period_start: periodStart.toISOString(),
        period_end: new Date().toISOString(),
      },
      by_source: bySourceArray,
      by_brand: byBrandArray,
      by_model: byModelArray,
      recent_activity: recentActivity,
    });
  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 },
    );
  }
}
