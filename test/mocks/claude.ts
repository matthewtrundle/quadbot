import { vi } from 'vitest';
import type { ClaudeResult, PromptVersion } from '../../apps/worker/src/claude.js';

/**
 * Creates a mock for the callClaude function.
 *
 * Usage:
 *   vi.mock('../../claude.js', () => ({ callClaude: createMockCallClaude() }));
 *   // Then set return value:
 *   mockCallClaude.mockResolvedValue(createClaudeResult({ ... }));
 */
export function createMockCallClaude() {
  return vi.fn();
}

/**
 * Creates a properly-shaped ClaudeResult for testing.
 */
export function createClaudeResult<T>(data: T): ClaudeResult<T> {
  return {
    data,
    model_meta: {
      prompt_version_id: 'test-prompt-v1',
      model: 'claude-sonnet-4-20250514',
      input_tokens: 100,
      output_tokens: 200,
      cost_cents: 0.09,
      latency_ms: 500,
    },
  };
}

/**
 * Creates a mock PromptVersion for testing.
 */
export function createMockPrompt(overrides: Partial<PromptVersion> = {}): PromptVersion {
  return {
    id: 'test-prompt-id',
    name: 'test_prompt_v1',
    version: 1,
    system_prompt: 'You are a test assistant.',
    user_prompt_template: '{{input}}',
    model: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}
