import { db } from '@quadbot/db';
import { promptVersions } from '@quadbot/db';
import { logger } from './logger.js';

const PROMPTS = [
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
  // Phase 4: Signal Extractor
  {
    name: 'signal_extractor_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a pattern recognition assistant. Given a recommendation and its measured outcome, extract a generalizable signal that could be useful for other brands or future decisions.

Focus on patterns that are:
- Actionable: can inform future recommendations
- Generalizable: not too specific to one brand
- Evidence-based: grounded in the outcome data

Return a JSON object with the signal details.`,
    user_prompt_template: `Extract a signal from the following recommendation and outcome.

## Recommendation
Title: {{recommendation_title}}
Body: {{recommendation_body}}
Source: {{recommendation_source}}
Data: {{recommendation_data}}

## Outcome
{{outcome_data}}

## Brand Context
Brand: {{brand_name}}
Modules: {{brand_modules}}

Return a JSON object with:
- signal_type: "pattern" | "anti-pattern" | "threshold" | "correlation"
- domain: string (e.g., "seo", "community", "content", "trends")
- title: string (concise signal name)
- description: string (what was learned, how to apply it)
- confidence: number 0-1 (how confident in this signal)
- evidence: object (supporting data points)
- ttl_days: number (how long this signal should remain active, 1-365)`,
    is_active: true,
  },
  // Phase 5: Strategic Prioritizer
  {
    name: 'strategic_prioritizer_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a strategic prioritization assistant. Given a set of pending recommendations with base scores, brand context, cross-brand signals, and applicable playbooks, adjust the priority ranking.

Your adjustments are bounded: you can only shift a recommendation's rank by -2 to +2 positions. The deterministic base score does most of the work; your role is to apply judgment that algorithms cannot.

Return a JSON array of adjustments.`,
    user_prompt_template: `Prioritize the following recommendations for brand "{{brand_name}}".

## Pending Recommendations (with base scores)
{{recommendations_json}}

## Brand Context
Mode: {{brand_mode}}
Modules: {{brand_modules}}

{{#if signal_context}}
## Cross-Brand Signals
{{signal_context}}
{{/if}}

{{#if playbook_context}}
## Applicable Playbooks
{{playbook_context}}
{{/if}}

{{#if time_budget}}
## Time Budget
Available: {{time_budget}} minutes/day
{{/if}}

Return a JSON object with:
- adjustments: array of { recommendation_id, delta_rank (integer -2 to +2), effort_estimate ("minutes" | "hours" | "days"), reasoning (string) }`,
    is_active: true,
  },
];

export async function seedPrompts(): Promise<void> {
  logger.info('Checking prompt versions...');

  for (const prompt of PROMPTS) {
    const existing = await db.query.promptVersions.findFirst({
      where: (pv, { eq, and }) =>
        and(eq(pv.name, prompt.name), eq(pv.version, prompt.version)),
    });

    if (existing) {
      logger.debug({ name: prompt.name }, 'Prompt already exists');
      continue;
    }

    await db.insert(promptVersions).values(prompt);
    logger.info({ name: prompt.name, version: prompt.version }, 'Seeded prompt version');
  }
}
