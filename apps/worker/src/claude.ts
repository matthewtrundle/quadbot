import Anthropic from '@anthropic-ai/sdk';
import Handlebars from 'handlebars';
import { z } from 'zod';
import { logger } from './logger.js';

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

export type CallClaudeOptions<T = unknown> = {
  retries?: number;
  signalContext?: string;
  playbookContext?: string;
  groundingValidator?: GroundingValidator<T>;
};

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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: prompt.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

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

      return {
        data: validated,
        model_meta: {
          prompt_version_id: prompt.id,
          model: response.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (err) {
      logger.warn(
        { err, attempt, prompt: prompt.name },
        `Claude call attempt ${attempt + 1} failed`,
      );
      if (attempt === retries) throw err;
    }
  }

  throw new Error('Unreachable');
}
