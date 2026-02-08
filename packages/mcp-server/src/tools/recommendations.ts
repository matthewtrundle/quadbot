import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, recommendations, actionDrafts, outcomes, artifacts } from '@quadbot/db';
import { eq, desc, and } from 'drizzle-orm';
import type { TrendContentBrief } from '@quadbot/shared';

export function registerRecommendationTools(server: McpServer) {
  server.tool(
    'list_recommendations',
    'List recommendations with optional filters',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
      source: z.string().optional().describe('Filter by source'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, priority, source, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(recommendations.brand_id, brandId));
      if (priority) conditions.push(eq(recommendations.priority, priority));
      if (source) conditions.push(eq(recommendations.source, source));

      const results = await db
        .select()
        .from(recommendations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(recommendations.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'get_recommendation',
    'Get full recommendation with related actions, outcomes, and artifacts',
    { recommendationId: z.string().uuid().describe('Recommendation UUID') },
    async ({ recommendationId }) => {
      const [rec] = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.id, recommendationId))
        .limit(1);

      if (!rec) {
        return { content: [{ type: 'text', text: 'Recommendation not found' }], isError: true };
      }

      const actions = await db
        .select()
        .from(actionDrafts)
        .where(eq(actionDrafts.recommendation_id, recommendationId));

      const recOutcomes = await db
        .select()
        .from(outcomes)
        .where(eq(outcomes.recommendation_id, recommendationId));

      const recArtifacts = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.recommendation_id, recommendationId));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...rec, actions, outcomes: recOutcomes, artifacts: recArtifacts }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_artifacts',
    'Browse artifacts by brand, type, status, or recommendation ID',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      type: z.string().optional().describe('Filter by artifact type (e.g. trend_content_brief, content_brief)'),
      status: z.string().optional().describe('Filter by status (e.g. draft, published)'),
      recommendationId: z.string().uuid().optional().describe('Filter by linked recommendation'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, type, status, recommendationId, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(artifacts.brand_id, brandId));
      if (type) conditions.push(eq(artifacts.type, type));
      if (status) conditions.push(eq(artifacts.status, status));
      if (recommendationId) conditions.push(eq(artifacts.recommendation_id, recommendationId));

      const results = await db
        .select()
        .from(artifacts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(artifacts.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'get_artifact',
    'Get a single artifact with full content and linked recommendation',
    { artifactId: z.string().uuid().describe('Artifact UUID') },
    async ({ artifactId }) => {
      const [artifact] = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, artifactId))
        .limit(1);

      if (!artifact) {
        return { content: [{ type: 'text', text: 'Artifact not found' }], isError: true };
      }

      let linkedRecommendation = null;
      if (artifact.recommendation_id) {
        const [rec] = await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, artifact.recommendation_id))
          .limit(1);
        linkedRecommendation = rec || null;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...artifact, recommendation: linkedRecommendation }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_content_prompt_from_brief',
    'Generate a structured content creation prompt from a trend content brief artifact for a specific platform',
    {
      artifactId: z.string().uuid().describe('Artifact UUID (must be a trend_content_brief)'),
      platform: z.enum(['blog', 'social', 'email']).describe('Target platform for the content'),
    },
    async ({ artifactId, platform }) => {
      const [artifact] = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, artifactId))
        .limit(1);

      if (!artifact) {
        return { content: [{ type: 'text', text: 'Artifact not found' }], isError: true };
      }

      if (artifact.type !== 'trend_content_brief') {
        return {
          content: [{ type: 'text', text: `This tool only works with trend_content_brief artifacts. Got: ${artifact.type}` }],
          isError: true,
        };
      }

      const brief = artifact.content as unknown as TrendContentBrief;

      // Get linked recommendation for context
      let trendContext = '';
      if (artifact.recommendation_id) {
        const [rec] = await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, artifact.recommendation_id))
          .limit(1);
        if (rec) {
          trendContext = `\n## Original Trend\nTitle: ${rec.title}\nDescription: ${rec.body}\n`;
        }
      }

      // Build platform-specific prompt
      const headlines = brief.headline_options
        .filter((h) => h.platform === platform || h.platform === 'general')
        .map((h) => `- ${h.headline} (${h.hook_type})`)
        .join('\n');

      const outline = brief.content_outline
        .map((s) => `### ${s.heading}\n${s.key_points.map((p) => `- ${p}`).join('\n')}\n(~${s.estimated_word_count} words)`)
        .join('\n\n');

      const keywords = brief.suggested_keywords
        .map((k) => `- ${k.keyword} (${k.priority}, ${k.intent})`)
        .join('\n');

      let platformSpecific = '';

      if (platform === 'blog' && brief.platform_angles.blog) {
        const b = brief.platform_angles.blog;
        platformSpecific = `## Blog Specifics
Format: ${b.format}
Target word count: ${b.word_count}
SEO Title: ${b.seo_title}
Meta Description: ${b.meta_description}`;
      } else if (platform === 'social' && brief.platform_angles.social) {
        const s = brief.platform_angles.social;
        platformSpecific = `## Social Media Specifics
Twitter Hook: ${s.twitter_hook}
LinkedIn Angle: ${s.linkedin_angle}${s.instagram_caption ? `\nInstagram Caption: ${s.instagram_caption}` : ''}`;
      } else if (platform === 'email' && brief.platform_angles.email) {
        const e = brief.platform_angles.email;
        platformSpecific = `## Email Specifics
Subject Lines:\n${e.subject_lines.map((s) => `- ${s}`).join('\n')}
Preview Text: ${e.preview_text}
Newsletter Angle: ${e.newsletter_angle}`;
      }

      const prompt = `# Content Creation Brief: ${artifact.title}
${trendContext}
## Headline Options
${headlines}

## Content Outline
${outline}

${platformSpecific}

## Keywords to Include
${keywords}

## Tone Guidance
Tone: ${brief.tone_guidance.recommended_tone}
Voice: ${brief.tone_guidance.voice_notes}
Avoid: ${brief.tone_guidance.things_to_avoid.join(', ')}

## Timeliness
Urgency: ${brief.timeliness.urgency}
Publish Window: ${brief.timeliness.publish_window}
Trend Stage: ${brief.timeliness.trend_lifecycle_stage}`;

      return {
        content: [{
          type: 'text',
          text: prompt,
        }],
      };
    },
  );
}
