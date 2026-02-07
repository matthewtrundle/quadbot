import type { Executor } from './types.js';
import { logger } from '../logger.js';

const executorRegistry = new Map<string, Executor>();

export function registerExecutor(executor: Executor): void {
  if (executorRegistry.has(executor.type)) {
    logger.warn({ type: executor.type }, 'Executor already registered, overwriting');
  }
  executorRegistry.set(executor.type, executor);
  logger.info({ type: executor.type }, 'Executor registered');
}

export function getExecutor(type: string): Executor | undefined {
  return executorRegistry.get(type);
}

export function listExecutors(): string[] {
  return Array.from(executorRegistry.keys());
}
