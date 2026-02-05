import { db } from './client.js';
import { promptVersions } from './schema.js';

const prompts = [
  {
    name: 'community_moderation_classifier_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a community moderation assistant for a brand. Your job is to classify user-generated content (posts, comments) against the brand's community rules and voice guidelines.

You must return a JSON object with your classification. Be consistent, fair, and err on the side of caution for edge cases.`,
    user_prompt_template: `Classify the following community post for brand "{{brand_name}}".

## Community Rules
{{community_rules}}

## Brand Voice Guidelines
{{brand_voice}}

## Post Content
Author: {{post_author}}
Content: {{post_content}}
{{#if post_context}}
Context: {{post_context}}
{{/if}}

Return a JSON object with:
- decision: "approve" | "reject" | "escalate" | "flag"
- reason: string explaining the decision
- confidence: number 0-1
- needs_human_review: boolean
- tags: string[] of applicable tags (e.g., "spam", "off-topic", "toxic", "self-promotion")`,
    is_active: true,
  },
  {
    name: 'gsc_digest_recommender_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are an SEO analyst assistant. You analyze Google Search Console data comparing today vs yesterday to identify significant changes and provide actionable recommendations.

Return structured JSON with your analysis. Focus on meaningful changes, not noise.`,
    user_prompt_template: `Analyze the following Google Search Console data for brand "{{brand_name}}".

## Today's Data
{{gsc_today}}

## Yesterday's Data
{{gsc_yesterday}}

Return a JSON object with:
- summary: string overview of the day's performance
- top_changes: array of { query, clicks_delta, impressions_delta, ctr_delta, position_delta }
- recommendations: array of { type, priority ("low"|"medium"|"high"|"critical"), title, description }

Focus on:
1. Queries with significant position changes (>3 positions)
2. CTR anomalies
3. New queries appearing or disappearing
4. Actionable SEO recommendations`,
    is_active: true,
  },
  {
    name: 'action_draft_generator_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are an action planning assistant. Given a recommendation, you generate a concrete action draft that can be executed (or reviewed before execution).

You must respect the brand's guardrails and mode. In Assist mode, generate actions that require human approval. Always assess risk accurately.`,
    user_prompt_template: `Generate an action draft for the following recommendation.

## Recommendation
Title: {{recommendation_title}}
Body: {{recommendation_body}}
Source: {{recommendation_source}}
Priority: {{recommendation_priority}}
Data: {{recommendation_data}}

## Brand Context
Mode: {{brand_mode}}
Guardrails: {{brand_guardrails}}

{{#if historical_context}}
## Historical Context (past similar actions)
{{historical_context}}
{{/if}}

Return a JSON object with:
- type: string action type (e.g., "publish_post", "update_meta", "send_reply", "flag_for_review")
- payload: object with action-specific data
- risk: "low" | "medium" | "high"
- guardrails_applied: object showing which guardrails were checked
- requires_approval: boolean (should be true in Assist mode)`,
    is_active: true,
  },
];

async function seed() {
  console.log('Seeding prompt versions...');

  for (const prompt of prompts) {
    // Check if prompt already exists
    const existing = await db.query.promptVersions.findFirst({
      where: (pv, { eq, and }) =>
        and(eq(pv.name, prompt.name), eq(pv.version, prompt.version)),
    });

    if (existing) {
      console.log(`  Prompt "${prompt.name}" v${prompt.version} already exists, skipping`);
      continue;
    }

    await db.insert(promptVersions).values(prompt);
    console.log(`  Seeded "${prompt.name}" v${prompt.version}`);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
