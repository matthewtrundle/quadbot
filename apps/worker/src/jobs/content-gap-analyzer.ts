import { brands, contentGaps, competitorSnapshots, metricSnapshots, recommendations } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import Anthropic from '@anthropic-ai/sdk';
import { trackDirectApiCall } from '../claude.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ContentGapItem = {
  topic: string;
  competitor_url: string;
  competitor_domain: string;
  estimated_volume: number;
  difficulty: 'easy' | 'medium' | 'hard';
  opportunity_score: number;
  rationale: string;
};

// ─── Main Job ───────────────────────────────────────────────────────────────

/**
 * Content Gap Analyzer
 *
 * Identifies topics that competitors rank for but the brand doesn't cover.
 * Uses competitor snapshots + Claude to find high-value content opportunities.
 *
 * Steps:
 * 1. Load brand guardrails (keywords, competitors, industry)
 * 2. Fetch recent competitor snapshots
 * 3. Ask Claude to identify content gaps
 * 4. Insert gaps into contentGaps table
 * 5. Store metric snapshots
 * 6. Create recommendations for top gaps
 * 7. Emit CONTENT_GAP_DETECTED event
 */
export async function contentGapAnalyzer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'content_gap_analyzer' }, 'Content_Gap_Analyzer starting');

  // 1. Load brand + guardrails
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('content_gap_analysis')) {
    logger.info({ jobId, brandId }, 'content_gap_analysis module not enabled, skipping');
    return;
  }

  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const competitors = (guardrails.competitors as string[]) || [];
  const keywords = (guardrails.keywords as string[]) || [];
  const industry = (guardrails.industry as string) || 'unknown';

  if (competitors.length === 0) {
    logger.info({ jobId, brandId }, 'No competitor domains configured, skipping');
    return;
  }

  // 2. Fetch recent competitor snapshots
  const snapshots = await db
    .select({
      url: competitorSnapshots.page_url,
      title: competitorSnapshots.title,
      competitor_domain: competitorSnapshots.competitor_domain,
    })
    .from(competitorSnapshots)
    .where(eq(competitorSnapshots.brand_id, brandId));

  if (snapshots.length === 0) {
    logger.info({ jobId, brandId }, 'No competitor snapshots found, skipping');
    return;
  }

  // Filter to only snapshots matching configured competitors
  const competitorSet = new Set(competitors.map((c) => c.toLowerCase()));
  const relevantSnapshots = snapshots.filter(
    (s) => s.competitor_domain && competitorSet.has(s.competitor_domain.toLowerCase()),
  );

  if (relevantSnapshots.length === 0) {
    logger.info({ jobId, brandId }, 'No competitor snapshots match configured competitors, skipping');
    return;
  }

  logger.info({ jobId, brandId, snapshotCount: relevantSnapshots.length }, 'Fetched competitor snapshots for analysis');

  // 3. Use Claude to analyze gaps
  const competitorPages = relevantSnapshots.map((s) => ({
    title: s.title || 'Untitled',
    url: s.url,
    domain: s.competitor_domain,
  }));

  const prompt = `You are an SEO content strategist. Analyze these competitor pages and identify content topics that the brand "${brand.name}" (industry: ${industry}) is likely missing.

Competitor pages:
${competitorPages.map((p) => `- ${p.title} (${p.url})`).join('\n')}

Brand's current focus keywords: ${keywords.length > 0 ? keywords.join(', ') : 'none specified'}

For each gap, provide:
- topic: the topic/keyword opportunity
- competitor_url: the specific competitor page
- competitor_domain: the domain
- estimated_volume: rough monthly search volume (number)
- difficulty: "easy", "medium", or "hard"
- opportunity_score: 0-100 (higher = better opportunity)
- rationale: why this is a gap worth filling

Return as JSON array. Focus on the top 10 most valuable gaps.
Respond with ONLY the JSON array, no markdown fences or other text.`;

  const anthropic = new Anthropic();
  let gaps: ContentGapItem[] = [];

  try {
    const callStart = Date.now();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    trackDirectApiCall(response, { db, brandId, jobId }, callStart);

    // Extract text from the response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Parse JSON from the response, handling potential markdown fences
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      // Strip markdown code fences
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      throw new Error('Claude response is not a JSON array');
    }

    gaps = parsed.map((item: Record<string, unknown>) => ({
      topic: String(item.topic || ''),
      competitor_url: String(item.competitor_url || ''),
      competitor_domain: String(item.competitor_domain || ''),
      estimated_volume: Number(item.estimated_volume) || 0,
      difficulty: (['easy', 'medium', 'hard'].includes(String(item.difficulty))
        ? String(item.difficulty)
        : 'medium') as 'easy' | 'medium' | 'hard',
      opportunity_score: Math.min(100, Math.max(0, Number(item.opportunity_score) || 0)),
      rationale: String(item.rationale || ''),
    }));

    logger.info({ jobId, brandId, gapsFound: gaps.length }, 'Claude identified content gaps');
  } catch (err) {
    logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed to get or parse Claude response');
    throw err;
  }

  if (gaps.length === 0) {
    logger.info({ jobId, brandId }, 'No content gaps identified');
    return;
  }

  // 4. Insert gaps into contentGaps table
  for (const gap of gaps) {
    await db.insert(contentGaps).values({
      brand_id: brandId,
      topic: gap.topic,
      competitor_url: gap.competitor_url,
      competitor_domain: gap.competitor_domain,
      estimated_volume: gap.estimated_volume,
      difficulty: gap.difficulty,
      opportunity_score: gap.opportunity_score,
      status: 'open',
    });
  }

  logger.info({ jobId, brandId, inserted: gaps.length }, 'Content gaps inserted');

  // 5. Store metric snapshots
  const avgScore = gaps.reduce((sum, g) => sum + g.opportunity_score, 0) / gaps.length;

  await db.insert(metricSnapshots).values([
    {
      brand_id: brandId,
      source: 'content_gap',
      metric_key: 'content_gaps_found',
      value: gaps.length,
    },
    {
      brand_id: brandId,
      source: 'content_gap',
      metric_key: 'content_gap_avg_score',
      value: Math.round(avgScore * 10) / 10,
    },
  ]);

  // 6. Generate recommendations for top 3 gaps
  const topGaps = gaps.sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 3);

  for (const gap of topGaps) {
    const priority = gap.opportunity_score > 80 ? 'high' : gap.opportunity_score > 50 ? 'medium' : 'low';

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'content_gap_analyzer',
        priority,
        title: `Content gap: ${gap.topic}`,
        body: `**Topic:** ${gap.topic}\n**Competitor:** ${gap.competitor_domain} (${gap.competitor_url})\n**Estimated Volume:** ${gap.estimated_volume}/mo\n**Difficulty:** ${gap.difficulty}\n**Opportunity Score:** ${gap.opportunity_score}/100\n\n**Rationale:** ${gap.rationale}`,
        data: {
          suggested_action: 'create_content_brief',
          topic: gap.topic,
          competitor_url: gap.competitor_url,
          competitor_domain: gap.competitor_domain,
          estimated_volume: gap.estimated_volume,
          difficulty: gap.difficulty,
          opportunity_score: gap.opportunity_score,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'content_gap_analyzer', priority },
      `content-gap:rec:${rec.id}`,
      'content_gap_analyzer',
    );
  }

  // 7. Emit CONTENT_GAP_DETECTED event
  await emitEvent(
    EventType.CONTENT_GAP_DETECTED,
    brandId,
    {
      gaps_found: gaps.length,
      top_topic: topGaps[0]?.topic,
      top_opportunity_score: topGaps[0]?.opportunity_score,
      avg_opportunity_score: Math.round(avgScore * 10) / 10,
    },
    `content-gap:${brandId}:${new Date().toISOString().split('T')[0]}`,
    'content_gap_analyzer',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'content_gap_analyzer',
      gapsFound: gaps.length,
      recommendationsCreated: topGaps.length,
      avgOpportunityScore: Math.round(avgScore * 10) / 10,
      durationMs: Date.now() - startTime,
    },
    'Content_Gap_Analyzer completed',
  );
}
