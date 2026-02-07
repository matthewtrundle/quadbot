import type { Database } from '@quadbot/db';

export interface ExecutorContext {
  db: Database;
  brandId: string;
  actionDraftId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ExecutorResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface Executor {
  type: string;
  execute(context: ExecutorContext): Promise<ExecutorResult>;
}
