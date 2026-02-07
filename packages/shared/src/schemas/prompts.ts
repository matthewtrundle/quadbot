import { z } from 'zod';

export const communityModerationOutputSchema = z.object({
  decision: z.enum(['approve', 'reject', 'escalate', 'flag']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  needs_human_review: z.boolean(),
  tags: z.array(z.string()),
});

export const gscChangeSchema = z.object({
  query: z.string(),
  clicks_delta: z.number(),
  impressions_delta: z.number(),
  ctr_delta: z.number(),
  position_delta: z.number(),
});

export const gscRecommendationSchema = z.object({
  type: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
});

export const gscDigestOutputSchema = z.object({
  summary: z.string(),
  top_changes: z.array(gscChangeSchema),
  recommendations: z.array(gscRecommendationSchema),
});

export const actionDraftGeneratorOutputSchema = z.object({
  type: z.string(),
  payload: z.record(z.unknown()),
  risk: z.enum(['low', 'medium', 'high']),
  guardrails_applied: z.record(z.unknown()),
  requires_approval: z.boolean(),
});

export const strategicPrioritizerOutputSchema = z.object({
  adjustments: z.array(z.object({
    recommendation_id: z.string(),
    delta_rank: z.number().min(-2).max(2),
    effort_estimate: z.enum(['minutes', 'hours', 'days']),
    reasoning: z.string(),
  })),
});

// Phase 6: Content Optimizer Output
export const titleVariantSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  predicted_ctr_lift: z.number().min(0).max(100),
});

export const metaDescriptionSchema = z.object({
  description: z.string(),
  includes_cta: z.boolean(),
  target_intent: z.string(),
});

export const contentBriefSchema = z.object({
  target_keyword: z.string(),
  search_intent: z.enum(['informational', 'navigational', 'transactional', 'commercial']),
  recommended_word_count: z.number(),
  outline: z.array(z.object({
    heading: z.string(),
    points: z.array(z.string()),
  })),
  internal_link_opportunities: z.array(z.object({
    anchor_text: z.string(),
    target_url: z.string(),
  })),
});

export const contentOptimizerOutputSchema = z.object({
  page_url: z.string(),
  current_title: z.string(),
  title_variants: z.array(titleVariantSchema),
  meta_descriptions: z.array(metaDescriptionSchema),
  content_brief: contentBriefSchema.optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  estimated_impact: z.string(),
});

// Phase 7: Multi-Source Intelligence Outputs
export const adsPerformanceOutputSchema = z.object({
  summary: z.string(),
  top_campaigns: z.array(z.object({
    campaign_name: z.string(),
    spend: z.number(),
    conversions: z.number(),
    roas: z.number(),
    trend: z.enum(['up', 'down', 'stable']),
  })),
  recommendations: z.array(z.object({
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    title: z.string(),
    description: z.string(),
  })),
});

export const analyticsInsightsOutputSchema = z.object({
  summary: z.string(),
  key_metrics: z.object({
    sessions: z.number(),
    users: z.number(),
    bounce_rate: z.number(),
    avg_session_duration: z.number(),
    conversions: z.number(),
  }),
  top_pages: z.array(z.object({
    page_path: z.string(),
    pageviews: z.number(),
    avg_time_on_page: z.number(),
    exit_rate: z.number(),
  })),
  recommendations: z.array(z.object({
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    title: z.string(),
    description: z.string(),
  })),
});

export const crossChannelCorrelationSchema = z.object({
  summary: z.string(),
  correlations: z.array(z.object({
    channel_a: z.string(),
    channel_b: z.string(),
    correlation_type: z.enum(['positive', 'negative', 'neutral']),
    insight: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  unified_recommendations: z.array(z.object({
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    title: z.string(),
    description: z.string(),
    affected_channels: z.array(z.string()),
  })),
});

export type StrategicPrioritizerOutput = z.infer<typeof strategicPrioritizerOutputSchema>;
export type CommunityModerationOutput = z.infer<typeof communityModerationOutputSchema>;
export type GscDigestOutput = z.infer<typeof gscDigestOutputSchema>;
export type ActionDraftGeneratorOutput = z.infer<typeof actionDraftGeneratorOutputSchema>;
// Phase 8: Self-Improvement Engine
export const capabilityGapOutputSchema = z.object({
  current_capabilities: z.array(z.object({
    name: z.string(),
    data_sources: z.array(z.string()),
    quality_score: z.number().min(0).max(1),
    limitations: z.array(z.string()),
  })),
  improvement_suggestions: z.array(z.object({
    category: z.enum(['integration', 'data_source', 'feature', 'analysis', 'automation']),
    title: z.string(),
    description: z.string(),
    rationale: z.string(),
    expected_impact: z.string(),
    implementation_effort: z.enum(['low', 'medium', 'high']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    prerequisites: z.array(z.string()).optional(),
    example_use_case: z.string(),
  })),
  meta_observations: z.array(z.object({
    observation: z.string(),
    implication: z.string(),
    suggested_action: z.string(),
  })),
});

export type ContentOptimizerOutput = z.infer<typeof contentOptimizerOutputSchema>;
export type AdsPerformanceOutput = z.infer<typeof adsPerformanceOutputSchema>;
export type AnalyticsInsightsOutput = z.infer<typeof analyticsInsightsOutputSchema>;
export type CrossChannelCorrelationOutput = z.infer<typeof crossChannelCorrelationSchema>;
export type CapabilityGapOutput = z.infer<typeof capabilityGapOutputSchema>;
