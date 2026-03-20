import { brands, geoVisibilityScores, metricSnapshots, recommendations } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueryResult {
  query: string;
  platform: string;
  responseText: string;
  isMentioned: boolean;
  isCited: boolean;
  position: number | null;
  snippet: string | null;
  competitorMentions: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateQueries(keywords: string[], industry: string): string[] {
  const queries: string[] = [];
  const limitedKeywords = keywords.slice(0, 10);

  for (const keyword of limitedKeywords) {
    queries.push(`best ${keyword} tools`);
    queries.push(`what is ${keyword}`);
    if (industry) {
      queries.push(`${industry} ${keyword} recommendations`);
    }
    if (queries.length >= 15) break;
  }

  return queries.slice(0, 15);
}

function analyzeResponse(
  responseText: string,
  brandName: string,
  brandDomain: string | null,
  competitors: string[],
): {
  isMentioned: boolean;
  isCited: boolean;
  position: number | null;
  snippet: string | null;
  competitorMentions: string[];
} {
  const lowerResponse = responseText.toLowerCase();
  const lowerBrandName = brandName.toLowerCase();

  // Check brand mention
  const isMentioned = lowerResponse.includes(lowerBrandName);

  // Check brand domain citation
  const isCited = brandDomain ? lowerResponse.includes(brandDomain.toLowerCase()) : false;

  // Determine position by finding where the brand appears relative to sentences
  let position: number | null = null;
  let snippet: string | null = null;

  if (isMentioned) {
    const sentences = responseText.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);
    let mentionCount = 0;
    for (let i = 0; i < sentences.length; i++) {
      // Check each sentence for any brand-like or product-like mention (heuristic: capitalized words)
      // For position, count sentences that mention any brand/product before ours
      if (sentences[i].toLowerCase().includes(lowerBrandName)) {
        position = mentionCount + 1;
        snippet = sentences[i].trim().slice(0, 500);
        break;
      }
      // Count sentences that seem to reference other products/brands (rough heuristic)
      if (/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/.test(sentences[i])) {
        mentionCount++;
      }
    }
  }

  // Check competitor mentions
  const competitorMentions = competitors.filter((c) => lowerResponse.includes(c.toLowerCase()));

  return { isMentioned, isCited, position, snippet, competitorMentions };
}

async function queryPerplexity(query: string): Promise<{ text: string; platform: string }> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{ role: 'user', content: query }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content || '';
  return { text, platform: 'perplexity' };
}

async function queryClaude(query: string): Promise<{ text: string; platform: string }> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `You are simulating an AI search engine. Answer this query concisely, citing specific brands and URLs where appropriate: ${query}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, platform: 'claude_simulated' };
}

// ─── Main Job ───────────────────────────────────────────────────────────────

export async function geoVisibilityTracker(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'geo_visibility_tracker' }, 'GEO visibility tracker starting');

  // 1. Load brand
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // 2. Check module enablement
  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('geo_visibility')) {
    logger.info({ jobId, brandId }, 'GEO visibility module not enabled, skipping');
    return;
  }

  // 3. Extract guardrails
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const keywords = (guardrails.keywords as string[]) || [];
  const competitors = (guardrails.competitors as string[]) || [];
  const industry = (guardrails.industry as string) || '';
  const brandDomain = (guardrails.domain as string) || null;

  if (keywords.length === 0) {
    logger.info({ jobId, brandId }, 'No keywords configured in guardrails, skipping GEO visibility check');
    return;
  }

  // 4. Generate queries
  const queries = generateQueries(keywords, industry);
  logger.info({ jobId, brandId, queryCount: queries.length }, 'Generated search queries');

  // 5. Determine which API to use
  const usePerplexity = !!process.env.PERPLEXITY_API_KEY;
  const queriesToRun = usePerplexity ? queries : queries.slice(0, 5); // Limit to 5 for Claude fallback

  if (!usePerplexity) {
    logger.info({ jobId, brandId }, 'PERPLEXITY_API_KEY not set, using Claude simulation (limited to 5 queries)');
  }

  // 6. Query each and analyze
  const results: QueryResult[] = [];

  for (const query of queriesToRun) {
    try {
      const { text, platform } = usePerplexity ? await queryPerplexity(query) : await queryClaude(query);

      const analysis = analyzeResponse(text, brand.name, brandDomain as string | null, competitors);

      results.push({
        query,
        platform,
        responseText: text,
        isMentioned: analysis.isMentioned,
        isCited: analysis.isCited,
        position: analysis.position,
        snippet: analysis.snippet,
        competitorMentions: analysis.competitorMentions,
      });

      logger.debug(
        { jobId, query, platform, mentioned: analysis.isMentioned, cited: analysis.isCited },
        'Query result processed',
      );

      // Rate limiting: 1 second between API calls
      await delay(1000);
    } catch (err) {
      logger.error({ jobId, brandId, query, err: (err as Error).message }, 'Failed to process query');
    }
  }

  if (results.length === 0) {
    logger.warn({ jobId, brandId }, 'No queries were successfully processed');
    return;
  }

  // 7. Store results in geoVisibilityScores
  for (const result of results) {
    await db.insert(geoVisibilityScores).values({
      brand_id: brandId,
      query: result.query,
      platform: result.platform,
      is_mentioned: result.isMentioned,
      is_cited: result.isCited,
      position: result.position,
      snippet: result.snippet,
      competitor_mentions: result.competitorMentions,
      raw_response: result.responseText,
    });
  }

  // 8. Calculate aggregate metrics
  const mentionedCount = results.filter((r) => r.isMentioned).length;
  const citedCount = results.filter((r) => r.isCited).length;
  const positionResults = results.filter((r) => r.position !== null);
  const avgPosition =
    positionResults.length > 0
      ? positionResults.reduce((sum, r) => sum + (r.position || 0), 0) / positionResults.length
      : 0;

  const visibilityRate = (mentionedCount / results.length) * 100;
  const citationRate = (citedCount / results.length) * 100;

  // Store metric snapshots
  const metricEntries = [
    { metric_key: 'geo_visibility_rate', value: visibilityRate },
    { metric_key: 'geo_citation_rate', value: citationRate },
    { metric_key: 'geo_avg_position', value: avgPosition },
  ];

  for (const entry of metricEntries) {
    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'geo',
      metric_key: entry.metric_key,
      value: entry.value,
      dimensions: {
        query_count: results.length,
        platform: usePerplexity ? 'perplexity' : 'claude_simulated',
      },
    });
  }

  logger.info({ jobId, brandId, visibilityRate, citationRate, avgPosition }, 'GEO metrics stored');

  // 9. Generate recommendations
  if (visibilityRate < 30) {
    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'geo_visibility_tracker',
        priority: 'high',
        title: 'Low AI search visibility — improve your GEO presence',
        body:
          `Your brand was mentioned in only ${visibilityRate.toFixed(1)}% of AI search queries (${mentionedCount}/${results.length}). ` +
          `AI-powered search engines like Perplexity, ChatGPT, and Google AI Overviews are increasingly used by potential customers. ` +
          `Consider creating authoritative, well-structured content that directly answers common industry questions. ` +
          `Focus on building citations from reputable sources and ensuring your brand appears in relevant knowledge bases.`,
        data: {
          visibility_rate: visibilityRate,
          citation_rate: citationRate,
          avg_position: avgPosition,
          queries_checked: results.length,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'geo_visibility_tracker', priority: 'high' },
      `geo:low_visibility:${new Date().toISOString().slice(0, 10)}`,
      'geo_visibility_tracker',
    );
  }

  // Check if competitors appear more often
  const competitorFrequency: Record<string, number> = {};
  for (const result of results) {
    for (const comp of result.competitorMentions) {
      competitorFrequency[comp] = (competitorFrequency[comp] || 0) + 1;
    }
  }

  const moreVisibleCompetitors = Object.entries(competitorFrequency)
    .filter(([, count]) => count > mentionedCount)
    .sort((a, b) => b[1] - a[1]);

  if (moreVisibleCompetitors.length > 0) {
    const competitorList = moreVisibleCompetitors
      .map(([name, count]) => `${name} (${count}/${results.length} queries)`)
      .join(', ');

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'geo_visibility_tracker',
        priority: 'medium',
        title: 'Competitors outperforming you in AI search results',
        body:
          `The following competitors appear more frequently than your brand in AI search results: ${competitorList}. ` +
          `Your brand appeared in ${mentionedCount}/${results.length} queries. ` +
          `Analyze what content and citations these competitors have that you lack, and develop a strategy to increase your AI search presence.`,
        data: {
          competitor_frequency: competitorFrequency,
          brand_mention_count: mentionedCount,
          queries_checked: results.length,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'geo_visibility_tracker', priority: 'medium' },
      `geo:competitor_gap:${new Date().toISOString().slice(0, 10)}`,
      'geo_visibility_tracker',
    );
  }

  // 10. Emit completion event
  await emitEvent(
    EventType.GEO_VISIBILITY_CHECKED,
    brandId,
    {
      visibility_rate: visibilityRate,
      citation_rate: citationRate,
      avg_position: avgPosition,
      queries_checked: results.length,
      platform: usePerplexity ? 'perplexity' : 'claude_simulated',
    },
    `geo:checked:${new Date().toISOString().slice(0, 10)}`,
    'geo_visibility_tracker',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'geo_visibility_tracker',
      queriesProcessed: results.length,
      visibilityRate,
      citationRate,
      avgPosition,
      durationMs: Date.now() - startTime,
    },
    'GEO visibility tracker completed',
  );
}
