import { llmUsage } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import type { ClaudeResult } from '../claude.js';
import { logger } from '../logger.js';

/**
 * Phase 5: Record LLM usage after each callClaude invocation.
 */
export async function recordLlmUsage(
  db: Database,
  brandId: string,
  jobId: string,
  meta: ClaudeResult<unknown>['model_meta'],
): Promise<void> {
  try {
    await db.insert(llmUsage).values({
      brand_id: brandId,
      job_id: jobId,
      prompt_version_id: meta.prompt_version_id,
      model: meta.model,
      input_tokens: meta.input_tokens,
      output_tokens: meta.output_tokens,
      cost_cents: meta.cost_cents,
      latency_ms: meta.latency_ms,
    });
  } catch (err) {
    // Don't fail the job if usage tracking fails
    logger.warn({ err, brandId, jobId }, 'Failed to record LLM usage');
  }
}
