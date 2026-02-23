import { artifacts, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { contentWriterOutputSchema } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';

/**
 * Content Writer Job
 * Takes a trend_content_brief artifact and generates a full blog post.
 *
 * Payload:
 *   artifact_id: string - the trend_content_brief artifact to write from
 *   platform: 'blog' | 'social' | 'email' (default: 'blog')
 *   target_word_count?: number (default: 1500)
 */
export async function contentWriter(ctx: JobContext): Promise<void> {
  const { db, brandId, jobId, payload } = ctx;

  const artifactId = payload.artifact_id as string;
  const platform = (payload.platform as string) || 'blog';
  const targetWordCount = (payload.target_word_count as number) || 1500;

  if (!artifactId) throw new Error('Missing required payload: artifact_id');

  // Load the content brief artifact
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${artifactId} not found`);
  if (artifact.type !== 'trend_content_brief') {
    throw new Error(`Artifact ${artifactId} is type '${artifact.type}', expected 'trend_content_brief'`);
  }

  // Load brand for context
  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const briefContent = artifact.content as Record<string, unknown>;

  // Extract tone guidance
  const toneGuidance = briefContent.tone_guidance as Record<string, string> | undefined;
  const tone = toneGuidance?.recommended_tone || 'professional and informative';

  // Build content brief summary for the LLM
  const contentBriefJson = JSON.stringify(briefContent, null, 2);

  // Load prompt and call LLM
  const prompt = await loadActivePrompt('content_writer_v1');

  const result = await callClaude(
    prompt,
    {
      content_brief: contentBriefJson,
      brand_name: brand.name,
      industry: (brand.guardrails as Record<string, unknown>)?.industry || 'general',
      tone_guidance: tone,
      target_word_count: String(targetWordCount),
    },
    contentWriterOutputSchema,
    { retries: 2, trackUsage: { db, brandId, jobId } },
  );

  // Store as new artifact
  const [generatedArtifact] = await db
    .insert(artifacts)
    .values({
      brand_id: brandId,
      recommendation_id: artifact.recommendation_id,
      type: 'generated_content',
      title: result.data.title,
      content: {
        ...result.data,
        source_brief_id: artifactId,
        platform,
        generated_at: new Date().toISOString(),
      },
      parent_artifact_id: artifactId,
      status: 'draft',
    })
    .returning();

  logger.info({
    jobId,
    brandId,
    artifactId: generatedArtifact.id,
    title: result.data.title,
    wordCount: result.data.content_markdown.split(/\s+/).length,
    platform,
  }, 'Content generated from brief');
}
