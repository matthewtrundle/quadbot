import { capabilityGapOutputSchema } from '@quadbot/shared';
import {
  brands,
  brandIntegrations,
  recommendations,
  actionDrafts,
  outcomes,
  improvementSuggestions,
  evaluationRuns,
} from '@quadbot/db';
import { eq, and, gte, desc, count } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';

type IntegrationInfo = {
  type: string;
  hasCredentials: boolean;
  config: Record<string, unknown>;
};

type BrandCapabilities = {
  brand_id: string;
  brand_name: string;
  integrations: IntegrationInfo[];
  recommendation_count_30d: number;
  acceptance_rate: number | null;
  action_execution_count: number;
  outcome_measurement_count: number;
  last_evaluation: {
    calibration_error: number | null;
    avg_outcome_delta: number | null;
  } | null;
};

/**
 * Capability Gap Analyzer Job
 *
 * Self-improvement engine that:
 * 1. Analyzes what data sources and integrations are available
 * 2. Reviews the quality and outcomes of recent recommendations
 * 3. Identifies gaps in capabilities that would improve analysis
 * 4. Suggests new integrations, features, or data sources
 * 5. Proposes specific improvements with rationale
 *
 * Triggered: Weekly on Mondays at 6:00 AM
 */
export async function capabilityGapAnalyzer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  // If brandId is provided, analyze that brand. Otherwise, analyze system-wide.
  const isSystemWide = !brandId || brandId === 'system';

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('capability_gap_analyzer_v1');
  } catch {
    logger.warn({ jobId }, 'Capability gap analyzer prompt not found, skipping');
    return;
  }

  // Gather capability data
  const capabilities = isSystemWide
    ? await gatherSystemCapabilities(db)
    : await gatherBrandCapabilities(db, brandId);

  // Get existing suggestions to avoid duplicates
  const existingSuggestions = await db
    .select({ title: improvementSuggestions.title })
    .from(improvementSuggestions)
    .where(
      and(
        eq(improvementSuggestions.status, 'pending'),
        isSystemWide ? eq(improvementSuggestions.brand_id, null as any) : eq(improvementSuggestions.brand_id, brandId),
      ),
    );

  const existingTitles = new Set(existingSuggestions.map((s) => s.title.toLowerCase()));

  const result = await callClaude(
    prompt,
    {
      scope: isSystemWide ? 'system-wide' : 'brand-specific',
      capabilities_data: JSON.stringify(capabilities),
      existing_suggestions: JSON.stringify(Array.from(existingTitles)),
    },
    capabilityGapOutputSchema,
  );

  // Store new improvement suggestions
  let newSuggestionsCount = 0;
  for (const suggestion of result.data.improvement_suggestions) {
    // Skip if already suggested
    if (existingTitles.has(suggestion.title.toLowerCase())) {
      continue;
    }

    await db.insert(improvementSuggestions).values({
      brand_id: isSystemWide ? null : brandId,
      category: suggestion.category,
      title: suggestion.title,
      description: suggestion.description,
      rationale: suggestion.rationale,
      expected_impact: suggestion.expected_impact,
      implementation_effort: suggestion.implementation_effort,
      priority: suggestion.priority,
      status: 'pending',
      context: {
        prerequisites: suggestion.prerequisites,
        example_use_case: suggestion.example_use_case,
        current_capabilities: result.data.current_capabilities,
        meta_observations: result.data.meta_observations,
      },
      source_job_id: jobId,
    });

    newSuggestionsCount++;
    logger.info(
      { jobId, suggestion: suggestion.title, priority: suggestion.priority },
      'New improvement suggestion created',
    );
  }

  // Log meta observations for visibility
  for (const observation of result.data.meta_observations) {
    logger.info(
      { jobId, observation: observation.observation, action: observation.suggested_action },
      'System meta-observation',
    );
  }

  logger.info(
    {
      jobId,
      scope: isSystemWide ? 'system' : brandId,
      newSuggestions: newSuggestionsCount,
      totalSuggestions: result.data.improvement_suggestions.length,
      metaObservations: result.data.meta_observations.length,
    },
    'Capability gap analysis complete',
  );
}

async function gatherSystemCapabilities(db: JobContext['db']): Promise<BrandCapabilities[]> {
  const allBrands = await db.select().from(brands);
  const capabilities: BrandCapabilities[] = [];

  for (const brand of allBrands) {
    const brandCaps = await gatherBrandCapabilities(db, brand.id);
    capabilities.push(...brandCaps);
  }

  return capabilities;
}

async function gatherBrandCapabilities(
  db: JobContext['db'],
  brandId: string,
): Promise<BrandCapabilities[]> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return [];

  // Get integrations
  const integrations = await db
    .select()
    .from(brandIntegrations)
    .where(eq(brandIntegrations.brand_id, brandId));

  const integrationInfo: IntegrationInfo[] = integrations.map((i) => ({
    type: i.type,
    hasCredentials: !!(i.credentials_encrypted || i.shared_credential_id),
    config: i.config as Record<string, unknown>,
  }));

  // Get recommendation count (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recCount] = await db
    .select({ count: count() })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        gte(recommendations.created_at, thirtyDaysAgo),
      ),
    );

  // Get acceptance rate from recent evaluation
  const [latestEval] = await db
    .select()
    .from(evaluationRuns)
    .where(eq(evaluationRuns.brand_id, brandId))
    .orderBy(desc(evaluationRuns.created_at))
    .limit(1);

  // Get action execution count
  const [actionCount] = await db
    .select({ count: count() })
    .from(actionDrafts)
    .where(
      and(
        eq(actionDrafts.brand_id, brandId),
        eq(actionDrafts.status, 'executed'),
      ),
    );

  // Get outcome measurement count
  const outcomeCount = await db
    .select({ count: count() })
    .from(outcomes)
    .innerJoin(recommendations, eq(outcomes.recommendation_id, recommendations.id))
    .where(eq(recommendations.brand_id, brandId));

  return [
    {
      brand_id: brandId,
      brand_name: brand.name,
      integrations: integrationInfo,
      recommendation_count_30d: recCount?.count || 0,
      acceptance_rate: latestEval?.acceptance_rate || null,
      action_execution_count: actionCount?.count || 0,
      outcome_measurement_count: outcomeCount[0]?.count || 0,
      last_evaluation: latestEval
        ? {
            calibration_error: latestEval.calibration_error,
            avg_outcome_delta: latestEval.avg_outcome_delta,
          }
        : null,
    },
  ];
}
