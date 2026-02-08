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
  // Brand Profiler: auto-detect brand profile from website content
  {
    name: 'brand_profiler_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a brand analysis assistant. Given website content and a brand name, you identify the brand's industry, business description, target audience, relevant keywords, and likely competitors.

Return structured JSON. Be specific and accurate based on the actual website content provided.`,
    user_prompt_template: `Analyze the following brand and website content to build a brand profile.

## Brand Name
{{brand_name}}

## Website Content
{{website_content}}

Return a JSON object with:
- industry: string (e.g., "food & beverage", "technology", "healthcare", "retail", "finance")
- description: string (1-2 sentence description of what the brand does)
- target_audience: string (who the brand's primary audience is)
- keywords: string[] (5-15 relevant industry/product keywords for this brand)
- competitors: string[] (3-5 likely competitors based on industry and offerings)`,
    is_active: true,
  },
  // Trend Relevance + Sensitivity Filter
  {
    name: 'trend_relevance_filter_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a trend relevance and sensitivity filter for a brand's content recommendations. You evaluate trending topics against a brand's profile to determine:

1. RELEVANCE: Does this trend connect to the brand's industry, products, audience, or values?
2. SENSITIVITY: Does this trend involve topics a brand should NOT capitalize on?

SENSITIVITY CATEGORIES (always flag these):
- Tragedies, deaths, disasters (natural or man-made)
- Kidnappings, crimes against persons
- Political controversies or partisan issues
- Hate speech, discrimination, or social division
- Military conflicts, terrorism, or acts of war
- Child exploitation or endangerment
- Health crises or pandemics (unless the brand is in healthcare)

A trend can be relevant but still sensitive. Filter OUT trends that are sensitive OR irrelevant.

Return structured JSON evaluating each trend.`,
    user_prompt_template: `Filter the following trending topics for brand relevance and sensitivity.

## Brand Profile
Name: {{brand_name}}
Industry: {{brand_industry}}
Description: {{brand_description}}
Target Audience: {{brand_audience}}
Keywords: {{brand_keywords}}
Content Policies: {{brand_policies}}

## Trending Topics
{{trends_json}}

For each trend (by index), return a JSON object with:
- filtered_trends: array of objects, one per trend:
  - index: number (0-based index of the trend)
  - relevant: boolean (does this connect to the brand?)
  - sensitive: boolean (does this involve a sensitivity category?)
  - relevance_reason: string (why it is or isn't relevant)
  - sensitivity_flag: string (optional — which sensitivity category, if any)
  - suggested_angle: string (optional — how the brand could use this trend, if relevant and not sensitive)
  - priority: "low" | "medium" | "high" | "critical" (adjusted priority based on brand fit)`,
    is_active: true,
  },
  // Trend Content Brief Enricher: generates multi-platform content briefs from trending topics
  {
    name: 'trend_brief_enricher_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a content strategist. Given a trending topic and brand context, you create structured multi-platform content briefs that a content creator can immediately act on.

Your briefs must be:
- ACTIONABLE: specific headlines, outlines, and platform-specific angles ready to use
- BRAND-ALIGNED: tone, keywords, and angles match the brand's industry and audience
- MULTI-PLATFORM: provide angles for blog, social media, and email where appropriate
- TIME-SENSITIVE: reflect the trend's lifecycle stage and urgency

Return structured JSON matching the requested schema exactly.`,
    user_prompt_template: `Create a multi-platform content brief for the following trending topic.

## Trend
Title: {{trend_title}}
Description: {{trend_body}}
Source: {{trend_source}}

## Brand Context
Name: {{brand_name}}
Industry: {{brand_industry}}
Description: {{brand_description}}
Target Audience: {{brand_audience}}
Keywords: {{brand_keywords}}

Return a JSON object with:
- headline_options: array of 2-5 objects with { headline, platform ("blog"|"twitter"|"linkedin"|"email"|"general"), hook_type ("question"|"statistic"|"bold_claim"|"how_to"|"news_peg"|"contrarian") }
- content_outline: array of { heading, key_points (string[]), estimated_word_count }
- platform_angles: object with optional keys:
  - blog: { format, word_count, seo_title, meta_description }
  - social: { twitter_hook, linkedin_angle, instagram_caption (optional) }
  - email: { subject_lines (1-3 strings), preview_text, newsletter_angle }
- suggested_keywords: array of { keyword, intent ("informational"|"navigational"|"transactional"|"commercial"), priority ("primary"|"secondary"|"long_tail") }
- tone_guidance: { recommended_tone, voice_notes, things_to_avoid (string[]) }
- timeliness: { urgency ("immediate"|"this_week"|"this_month"|"evergreen"), publish_window, trend_lifecycle_stage ("emerging"|"peaking"|"sustained"|"declining") }`,
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
