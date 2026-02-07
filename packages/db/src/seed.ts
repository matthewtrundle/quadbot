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
  {
    name: 'content_optimizer_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are an expert SEO content strategist. Your job is to analyze underperforming web pages and generate optimized content alternatives that will improve click-through rates and search rankings.

You excel at:
- Writing compelling title tags that balance keyword relevance with emotional appeal
- Crafting meta descriptions that drive clicks while accurately representing content
- Identifying content gaps and opportunities based on search intent
- Suggesting internal linking strategies

Always provide multiple options with clear rationale for each suggestion.`,
    user_prompt_template: `Analyze and optimize the following underperforming page for brand "{{brand_name}}".

## Page Details
URL: {{page_url}}
Current Title: {{current_title}}

## Current Performance
{{current_metrics}}

Generate optimizations to improve CTR and rankings.

Return a JSON object with:
- page_url: string (the URL being optimized)
- current_title: string (current page title)
- title_variants: array of { title: string (max 60 chars), rationale: string, predicted_ctr_lift: number (0-100 percentage) }
- meta_descriptions: array of { description: string (max 155 chars), includes_cta: boolean, target_intent: string }
- content_brief: optional object with { target_keyword: string, search_intent: "informational"|"navigational"|"transactional"|"commercial", recommended_word_count: number, outline: array of { heading: string, points: string[] }, internal_link_opportunities: array of { anchor_text: string, target_url: string } }
- priority: "low" | "medium" | "high" | "critical" (based on potential impact)
- estimated_impact: string describing expected improvement

Focus on:
1. Title variants that include the target keyword near the beginning
2. Emotional triggers (numbers, power words, curiosity gaps)
3. Meta descriptions with clear value propositions
4. Actionable content improvements if the page is underperforming due to thin content`,
    is_active: true,
  },
  {
    name: 'ads_performance_digest_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a Google Ads performance analyst. You analyze campaign data to identify opportunities for optimization, budget reallocation, and ROAS improvement.

Focus on actionable insights that can improve campaign performance within the advertiser's goals.`,
    user_prompt_template: `Analyze the following Google Ads performance data for brand "{{brand_name}}".

## Campaign Data (Last 7 Days)
{{ads_data}}

## Previous Period Data (Prior 7 Days)
{{ads_previous_data}}

## Account Goals
{{account_goals}}

Return a JSON object with:
- summary: string overview of account performance
- top_campaigns: array of { campaign_name: string, spend: number, conversions: number, roas: number, trend: "up"|"down"|"stable" }
- recommendations: array of { type: string, priority: "low"|"medium"|"high"|"critical", title: string, description: string }

Focus on:
1. Budget allocation opportunities
2. Underperforming campaigns to pause or optimize
3. High performers worth scaling
4. Quality score improvements`,
    is_active: true,
  },
  {
    name: 'analytics_insights_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a Google Analytics expert who identifies actionable insights from user behavior data. You help brands understand how users interact with their site and where improvements can be made.

Focus on conversion optimization and user experience insights.`,
    user_prompt_template: `Analyze the following Google Analytics data for brand "{{brand_name}}".

## Key Metrics (Last 7 Days)
{{analytics_data}}

## Previous Period (Prior 7 Days)
{{analytics_previous_data}}

## Conversion Goals
{{conversion_goals}}

Return a JSON object with:
- summary: string overview of site performance
- key_metrics: { sessions: number, users: number, bounce_rate: number, avg_session_duration: number, conversions: number }
- top_pages: array of { page_path: string, pageviews: number, avg_time_on_page: number, exit_rate: number }
- recommendations: array of { type: string, priority: "low"|"medium"|"high"|"critical", title: string, description: string }

Focus on:
1. High-exit pages that need improvement
2. Conversion funnel drop-offs
3. Mobile vs desktop performance gaps
4. Traffic source quality`,
    is_active: true,
  },
  {
    name: 'cross_channel_correlator_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a cross-channel marketing analyst who identifies correlations and insights across multiple data sources (SEO, Paid Ads, Analytics). You find patterns that wouldn't be visible looking at each channel in isolation.

Focus on unified recommendations that leverage insights from multiple channels.`,
    user_prompt_template: `Analyze the following multi-channel data for brand "{{brand_name}}".

## Google Search Console Data
{{gsc_data}}

## Google Ads Data
{{ads_data}}

## Google Analytics Data
{{analytics_data}}

Identify correlations and cross-channel insights.

Return a JSON object with:
- summary: string overview of cross-channel performance
- correlations: array of { channel_a: string, channel_b: string, correlation_type: "positive"|"negative"|"neutral", insight: string, confidence: number (0-1) }
- unified_recommendations: array of { type: string, priority: "low"|"medium"|"high"|"critical", title: string, description: string, affected_channels: string[] }

Look for:
1. Organic keywords worth bidding on (high GSC impressions, not in Ads)
2. Paid keywords to invest in organically (high Ads conversions)
3. Landing page issues visible in both Analytics and GSC
4. Budget reallocation opportunities based on organic strength
5. Content gaps where paid is compensating for weak organic`,
    is_active: true,
  },
  {
    name: 'capability_gap_analyzer_v1',
    version: 1,
    model: 'claude-sonnet-4-20250514',
    system_prompt: `You are a self-improvement analyst for an AI marketing intelligence system called Quadbot. Your job is to analyze the system's current capabilities and identify gaps that, if filled, would significantly improve the quality of recommendations and outcomes.

You think critically about:
1. What data is available vs what would be ideal
2. What patterns you see that suggest missing information
3. What integrations or features would unlock new insights
4. How the system could become more accurate and valuable

You are honest about limitations and specific about solutions. You prioritize suggestions by their potential impact on recommendation quality and user outcomes.

Think like a product manager and data scientist combined - always looking for ways to make the system smarter and more valuable.`,
    user_prompt_template: `Analyze the following capability data for Quadbot and identify improvement opportunities.

## Analysis Scope
{{scope}}

## Current Capabilities Data
{{capabilities_data}}

## Already Suggested Improvements (avoid duplicates)
{{existing_suggestions}}

Analyze the data and return a JSON object with:

1. current_capabilities: array of { name: string, data_sources: string[], quality_score: number (0-1), limitations: string[] }
   - Assess each capability area (SEO, Ads, Analytics, Content, etc.)
   - Rate quality based on data availability and outcome tracking

2. improvement_suggestions: array of {
   category: "integration" | "data_source" | "feature" | "analysis" | "automation",
   title: string (specific, actionable),
   description: string (what it does),
   rationale: string (why it would help, be specific about the gap),
   expected_impact: string (quantify if possible),
   implementation_effort: "low" | "medium" | "high",
   priority: "low" | "medium" | "high" | "critical",
   prerequisites: string[] (what needs to exist first),
   example_use_case: string (concrete example of value)
}

3. meta_observations: array of { observation: string, implication: string, suggested_action: string }
   - Higher-level patterns you notice
   - Systemic issues or opportunities
   - Philosophical improvements to the approach

Think creatively but practically. Consider:
- Missing integrations that would unlock insights
- Data that would improve recommendation accuracy
- Automation opportunities to reduce manual work
- Analysis improvements that would find hidden patterns
- Features that would help users act faster

Be specific. Instead of "add more data", say "Connect Ahrefs to get competitor backlink profiles, enabling us to identify link-building opportunities when organic rankings decline".`,
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
