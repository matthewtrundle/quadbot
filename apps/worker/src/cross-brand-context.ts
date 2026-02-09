import { db } from '@quadbot/db';
import { signals, signalApplications } from '@quadbot/db';
import { eq, gt, desc, sql, and } from 'drizzle-orm';
import { logger } from './logger.js';

const MAX_SIGNALS = 5;
const MAX_CONTEXT_CHARS = 2000; // ~500 tokens

type WeightedSignal = {
  id: string;
  domain: string;
  signal_type: string;
  title: string;
  description: string;
  confidence: number;
  decay_weight: number;
  positive_rate: number;
  weighted_score: number;
};

/**
 * Phase 4: Cross-Brand Context
 * Get relevant signals for a brand + domain, filtered by:
 * 1. Not expired
 * 2. Domain match
 * 3. Weighted by confidence * decay_weight * positive outcome rate
 * Returns top K=5 signals, truncated to ~500 tokens.
 */
export async function getCrossBrandContext(
  brandId: string,
  domain: string,
  recommendationId?: string,
): Promise<string> {
  const now = new Date();

  // Get non-expired signals for this domain
  const activeSignals = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.domain, domain),
        gt(signals.expires_at, now),
      ),
    )
    .orderBy(desc(signals.confidence));

  if (activeSignals.length === 0) return '';

  // Weight each signal
  const weighted: WeightedSignal[] = [];

  for (const signal of activeSignals) {
    // Get application stats
    const applications = await db
      .select({
        total: sql<number>`count(*)`,
        positive: sql<number>`count(*) filter (where ${signalApplications.outcome_positive} = true)`,
      })
      .from(signalApplications)
      .where(eq(signalApplications.signal_id, signal.id));

    const total = Number(applications[0]?.total || 0);
    const positive = Number(applications[0]?.positive || 0);
    const positiveRate = total > 0 ? positive / total : 0.5; // Default to 0.5 for untested signals

    const weightedScore = signal.confidence * signal.decay_weight * positiveRate;

    weighted.push({
      id: signal.id,
      domain: signal.domain,
      signal_type: signal.signal_type,
      title: signal.title,
      description: signal.description,
      confidence: signal.confidence,
      decay_weight: signal.decay_weight,
      positive_rate: positiveRate,
      weighted_score: weightedScore,
    });
  }

  // Sort by weighted score, take top K
  weighted.sort((a, b) => b.weighted_score - a.weighted_score);
  const topSignals = weighted.slice(0, MAX_SIGNALS);

  if (topSignals.length === 0) return '';

  // Build context string with truncation
  let context = `Cross-brand signals for ${domain}:\n`;

  for (const sig of topSignals) {
    const entry = `- [${sig.signal_type}] ${sig.title} (confidence: ${sig.confidence.toFixed(2)}): ${sig.description}\n`;

    if (context.length + entry.length > MAX_CONTEXT_CHARS) {
      // Truncate description
      const available = MAX_CONTEXT_CHARS - context.length - 50;
      if (available > 0) {
        context += `- [${sig.signal_type}] ${sig.title}: ${sig.description.substring(0, available)}...\n`;
      }
      break;
    }

    context += entry;
  }

  // Track signal applications for these signals against this brand
  for (const sig of topSignals) {
    await db.insert(signalApplications).values({
      signal_id: sig.id,
      target_brand_id: brandId,
      recommendation_id: recommendationId || null,
    });
  }

  logger.debug({ brandId, domain, signalCount: topSignals.length }, 'Cross-brand context built');

  return context;
}
