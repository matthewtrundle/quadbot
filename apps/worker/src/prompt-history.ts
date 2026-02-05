import { db } from '@quadbot/db';
import { recommendations, actionDrafts, outcomes } from '@quadbot/db';
import { eq, desc, and } from 'drizzle-orm';

/**
 * Phase 5: Learning Loop Enhancement
 * Queries historical context (successes/failures) for injection into prompts.
 * Returns top 5 successful and top 5 failed past recommendations for a brand.
 */
export async function getHistoricalContext(brandId: string): Promise<string> {
  // Get recommendations with outcomes for this brand
  const recsWithOutcomes = await db
    .select({
      title: recommendations.title,
      source: recommendations.source,
      priority: recommendations.priority,
      delta: outcomes.delta,
      metric_name: outcomes.metric_name,
      draft_status: actionDrafts.status,
    })
    .from(recommendations)
    .leftJoin(outcomes, eq(outcomes.recommendation_id, recommendations.id))
    .leftJoin(actionDrafts, eq(actionDrafts.recommendation_id, recommendations.id))
    .where(eq(recommendations.brand_id, brandId))
    .orderBy(desc(recommendations.created_at))
    .limit(50);

  const successful = recsWithOutcomes
    .filter((r) => r.delta != null && r.delta > 0)
    .slice(0, 5);

  const failed = recsWithOutcomes
    .filter((r) => r.delta != null && r.delta <= 0)
    .slice(0, 5);

  if (successful.length === 0 && failed.length === 0) {
    return '';
  }

  let context = '';

  if (successful.length > 0) {
    context += 'Successful past actions:\n';
    for (const s of successful) {
      context += `- "${s.title}" (${s.source}, ${s.metric_name}: +${s.delta?.toFixed(2)})\n`;
    }
  }

  if (failed.length > 0) {
    context += '\nUnsuccessful past actions:\n';
    for (const f of failed) {
      context += `- "${f.title}" (${f.source}, ${f.metric_name}: ${f.delta?.toFixed(2)})\n`;
    }
  }

  return context;
}
