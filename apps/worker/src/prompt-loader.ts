import { db } from '@quadbot/db';
import { promptVersions } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { PromptVersion } from './claude.js';

export async function loadActivePrompt(name: string): Promise<PromptVersion> {
  const result = await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.name, name), eq(promptVersions.is_active, true)))
    .limit(1);

  if (result.length === 0) {
    throw new Error(`No active prompt version found for "${name}"`);
  }

  return result[0];
}
