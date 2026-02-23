import Anthropic from '@anthropic-ai/sdk';
import Handlebars from 'handlebars';
import { z } from 'zod';
import { logger } from './logger.js';
import { recordLlmUsage } from './lib/llm-usage-tracker.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export type PromptVersion = {
  id: string;
  name: string;
  version: number;
  system_prompt: string;
  user_prompt_template: string;
  model: string;
};

export type ClaudeResult<T> = {
  data: T;
  model_meta: {
    prompt_version_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
    latency_ms: number;
  };
};

export type GroundingValidationResult = {
  valid: boolean;
  reason?: string;
};

export type GroundingValidator<T> = (
  output: T,
  inputs: Record<string, unknown>,
) => GroundingValidationResult;

export type UsageTrackingContext = {
  db: import('@quadbot/db').Database;
  brandId: string;
  jobId: string;
};

export type CallClaudeOptions<T = unknown> = {
  retries?: number;
  signalContext?: string;
  playbookContext?: string;
  groundingValidator?: GroundingValidator<T>;
  modelOverride?: string;
  /** If provided, automatically records LLM usage after each call */
  trackUsage?: UsageTrackingContext;
};

/**
 * Phase 5: Model routing cost table (per 1M tokens, in cents)
 * Updated for current Anthropic pricing
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-3-5-20241022': { input: 80, output: 400 },
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-opus-4-20250514': { input: 1500, output: 7500 },
  // Fallback for unknown models
  default: { input: 300, output: 1500 },
};

/**
 * Phase 5: Smart model routing
 * Selects the most cost-effective model based on the prompt name/tier.
 */
const HAIKU_ELIGIBLE_PROMPTS = new Set([
  'community_moderation_classifier_v1',
  'trend_relevance_filter_v1',
  'content_optimizer_v1',
]);

const OPUS_ELIGIBLE_PROMPTS = new Set([
  'strategic_prioritizer_v1',
  'capability_gap_analyzer_v1',
]);

function selectModel(prompt: PromptVersion, override?: string): string {
  if (override) return override;

  // Use Haiku for simple classification tasks
  if (HAIKU_ELIGIBLE_PROMPTS.has(prompt.name)) {
    return 'claude-haiku-3-5-20241022';
  }

  // Use Opus for complex strategic reasoning
  if (OPUS_ELIGIBLE_PROMPTS.has(prompt.name)) {
    return prompt.model; // Keep original (Sonnet) — Opus is opt-in via override
  }

  // Default: use whatever the prompt specifies
  return prompt.model;
}

function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS.default;
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

export async function callClaude<T>(
  prompt: PromptVersion,
  variables: Record<string, unknown>,
  schema: z.ZodSchema<T>,
  retriesOrOptions: number | CallClaudeOptions<T> = 2,
): Promise<ClaudeResult<T>> {
  const options = typeof retriesOrOptions === 'number'
    ? { retries: retriesOrOptions }
    : retriesOrOptions;
  const retries = options.retries ?? 2;

  const anthropic = getClient();
  const template = Handlebars.compile(prompt.user_prompt_template);
  const userMessage = template(variables);

  // Build system prompt with optional signal and playbook context
  let systemPrompt = prompt.system_prompt;
  if (options.signalContext) {
    systemPrompt += `\n\n## Cross-Brand Signals\n${options.signalContext}`;
  }
  if (options.playbookContext) {
    systemPrompt += `\n\n## Applicable Playbook\n${options.playbookContext}`;
  }

  // Phase 5: Smart model selection
  const selectedModel = selectModel(prompt, options.modelOverride);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const startTime = Date.now();
    try {
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const latencyMs = Date.now() - startTime;

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonStr = textBlock.text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      const validated = schema.parse(parsed);

      // Run grounding validator if provided
      if (options.groundingValidator) {
        const groundingResult = options.groundingValidator(validated, variables);
        if (!groundingResult.valid) {
          throw new Error(`Grounding validation failed: ${groundingResult.reason || 'output not grounded in input data'}`);
        }
      }

      const costCents = calculateCostCents(
        response.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      const model_meta = {
        prompt_version_id: prompt.id,
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cost_cents: Math.round(costCents * 100) / 100,
        latency_ms: latencyMs,
      };

      // Auto-record LLM usage if tracking context provided
      if (options.trackUsage) {
        const { db: trackDb, brandId, jobId } = options.trackUsage;
        recordLlmUsage(trackDb, brandId, jobId, model_meta).catch(() => {});
      }

      return { data: validated, model_meta };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logger.warn(
        { err, attempt, prompt: prompt.name, model: selectedModel, latencyMs },
        `Claude call attempt ${attempt + 1} failed`,
      );

      // Phase 5: On rate limit, try falling back to a different model
      if (attempt < retries && isRateLimitError(err)) {
        const fallbackModel = getFallbackModel(selectedModel);
        if (fallbackModel && fallbackModel !== selectedModel) {
          logger.info(
            { from: selectedModel, to: fallbackModel, prompt: prompt.name },
            'Rate limited, falling back to alternative model',
          );
          // Override the model for retry — options is mutable
          (options as CallClaudeOptions<T>).modelOverride = fallbackModel;
        }
      }

      if (attempt === retries) throw err;
    }
  }

  throw new Error('Unreachable');
}

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status === 429;
  }
  return false;
}

function getFallbackModel(currentModel: string): string | null {
  // Haiku → Sonnet, Sonnet stays Sonnet, Opus → Sonnet
  if (currentModel.includes('haiku')) return 'claude-sonnet-4-20250514';
  if (currentModel.includes('opus')) return 'claude-sonnet-4-20250514';
  return null; // Sonnet has no fallback
}
