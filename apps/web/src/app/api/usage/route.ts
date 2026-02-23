import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { llmUsage, brands, recommendations } from '@quadbot/db';
import { eq, gte, desc, sql, and, isNotNull } from 'drizzle-orm';

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
      return new Date(0);
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || '7d';
  const periodStart = getPeriodStart(period);

  try {
    // Try to use llm_usage table first (new tracking)
    const hasLlmUsage = await db
      .select({ id: llmUsage.id })
      .from(llmUsage)
      .limit(1);

    if (hasLlmUsage.length > 0) {
      return await getUsageFromLlmTable(periodStart, admin, userBrandId);
    }

    // Fallback: derive from recommendations.model_meta
    return await getUsageFromRecommendations(periodStart, admin, userBrandId);
  } catch (error) {
    console.error('Usage API error:', error);
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
  }
}

async function getUsageFromLlmTable(periodStart: Date, admin: boolean, userBrandId: string | null) {
  const whereConditions = [
    gte(llmUsage.created_at, periodStart),
    ...(!admin && userBrandId ? [eq(llmUsage.brand_id, userBrandId)] : []),
  ];

  const rows = await db
    .select({
      id: llmUsage.id,
      brand_id: llmUsage.brand_id,
      brand_name: brands.name,
      model: llmUsage.model,
      input_tokens: llmUsage.input_tokens,
      output_tokens: llmUsage.output_tokens,
      cost_cents: llmUsage.cost_cents,
      latency_ms: llmUsage.latency_ms,
      created_at: llmUsage.created_at,
    })
    .from(llmUsage)
    .leftJoin(brands, eq(llmUsage.brand_id, brands.id))
    .where(and(...whereConditions))
    .orderBy(desc(llmUsage.created_at))
    .limit(500);

  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  const bySource: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  const byBrand: Record<string, { brand_name: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  const byModel: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};

  for (const row of rows) {
    const costUsd = (row.cost_cents || 0) / 100;

    totalCalls++;
    totalInputTokens += row.input_tokens;
    totalOutputTokens += row.output_tokens;
    totalCost += costUsd;

    // By model
    const model = row.model || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    byModel[model].calls++;
    byModel[model].input_tokens += row.input_tokens;
    byModel[model].output_tokens += row.output_tokens;
    byModel[model].cost_usd += costUsd;

    // By brand
    if (row.brand_id) {
      if (!byBrand[row.brand_id]) byBrand[row.brand_id] = { brand_name: row.brand_name || 'Unknown', calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      byBrand[row.brand_id].calls++;
      byBrand[row.brand_id].input_tokens += row.input_tokens;
      byBrand[row.brand_id].output_tokens += row.output_tokens;
      byBrand[row.brand_id].cost_usd += costUsd;
    }
  }

  const recentActivity = rows.slice(0, 20).map((r) => ({
    id: r.id,
    source: r.model,
    brand_name: r.brand_name || 'Unknown',
    title: `${r.model} call`,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: (r.cost_cents || 0) / 100,
    created_at: r.created_at.toISOString(),
  }));

  return NextResponse.json({
    summary: {
      total_calls: totalCalls,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_usd: totalCost,
      period_start: periodStart.toISOString(),
      period_end: new Date().toISOString(),
    },
    by_source: Object.entries(byModel).map(([model, data]) => ({ source: model, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    by_brand: Object.entries(byBrand).map(([brand_id, data]) => ({ brand_id, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    by_model: Object.entries(byModel).map(([model, data]) => ({ model, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    recent_activity: recentActivity,
  });
}

// Fallback: Anthropic pricing (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20241022': { input: 0.80, output: 4.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
};
const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

function calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const pricing = model && PRICING[model] ? PRICING[model] : DEFAULT_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

async function getUsageFromRecommendations(periodStart: Date, admin: boolean, userBrandId: string | null) {
  const whereConditions = [
    gte(recommendations.created_at, periodStart),
    isNotNull(recommendations.model_meta),
    ...(!admin && userBrandId ? [eq(recommendations.brand_id, userBrandId)] : []),
  ];

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
    .where(and(...whereConditions))
    .orderBy(desc(recommendations.created_at));

  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  const bySource: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  const byBrand: Record<string, { brand_name: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  const byModel: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
  const recentActivity: Array<{ id: string; source: string; brand_name: string; title: string; input_tokens: number; output_tokens: number; cost_usd: number; created_at: string }> = [];

  for (const rec of recsWithMeta) {
    const meta = rec.model_meta as { input_tokens?: number; output_tokens?: number; model?: string } | null;
    if (!meta) continue;

    const inputTokens = meta.input_tokens || 0;
    const outputTokens = meta.output_tokens || 0;
    const model = meta.model || 'unknown';
    const cost = calculateCost(inputTokens, outputTokens, model);

    totalCalls++;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCost += cost;

    if (!bySource[rec.source]) bySource[rec.source] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    bySource[rec.source].calls++;
    bySource[rec.source].input_tokens += inputTokens;
    bySource[rec.source].output_tokens += outputTokens;
    bySource[rec.source].cost_usd += cost;

    if (!byBrand[rec.brand_id]) byBrand[rec.brand_id] = { brand_name: rec.brand_name, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    byBrand[rec.brand_id].calls++;
    byBrand[rec.brand_id].input_tokens += inputTokens;
    byBrand[rec.brand_id].output_tokens += outputTokens;
    byBrand[rec.brand_id].cost_usd += cost;

    if (!byModel[model]) byModel[model] = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    byModel[model].calls++;
    byModel[model].input_tokens += inputTokens;
    byModel[model].output_tokens += outputTokens;
    byModel[model].cost_usd += cost;

    if (recentActivity.length < 20) {
      recentActivity.push({ id: rec.id, source: rec.source, brand_name: rec.brand_name, title: rec.title, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, created_at: rec.created_at.toISOString() });
    }
  }

  return NextResponse.json({
    summary: { total_calls: totalCalls, total_input_tokens: totalInputTokens, total_output_tokens: totalOutputTokens, total_cost_usd: totalCost, period_start: periodStart.toISOString(), period_end: new Date().toISOString() },
    by_source: Object.entries(bySource).map(([source, data]) => ({ source, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    by_brand: Object.entries(byBrand).map(([brand_id, data]) => ({ brand_id, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    by_model: Object.entries(byModel).map(([model, data]) => ({ model, ...data })).sort((a, b) => b.cost_usd - a.cost_usd),
    recent_activity: recentActivity,
  });
}
