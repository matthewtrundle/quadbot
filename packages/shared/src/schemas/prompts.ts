import { z } from 'zod';

// Shared recommendation type enum for all pipeline outputs
export const recommendationTypeEnum = z.enum([
  'ranking_improvement',
  'ranking_decline',
  'ctr_anomaly',
  'not_indexed',
  'page_not_indexed',
  'indexing_issue',
  'new_page',
  'content_updated',
  'crawl_error',
  'crawl_issue',
  'page_error',
  'fetch_error',
  'redirect_error',
  'sitemap_issue',
  'sitemap_error',
  'sitemap_missing',
  'sitemap_outdated',
  'deleted_page',
  'page_removed',
  'content_gap',
  'opportunity',
  'warning',
  'general',
  'budget_alert',
  'performance_decline',
  'performance_improvement',
  'audience_shift',
  'conversion_anomaly',
  'traffic_anomaly',
  'engagement_change',
  'cross_channel_opportunity',
  'attribution_insight',
  'flag_for_review',
  'update_meta',
  'update_content',
]);

// Action type enum for action draft generator
export const actionTypeEnum = z.enum([
  'gsc-index-request',
  'gsc-inspection',
  'gsc-sitemap-notify',
  'flag_for_review',
  'update_meta',
  'update_content',
  'publish_post',
  'send_reply',
  'general',
]);

export const communityModerationOutputSchema = z.object({
  decision: z.enum(['approve', 'reject', 'escalate', 'flag']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  needs_human_review: z.boolean(),
  tags: z.array(z.string()),
});

export const gscChangeSchema = z.object({
  query: z.string().min(1).max(500),
  clicks_delta: z.number(),
  impressions_delta: z.number(),
  ctr_delta: z.number().min(-1).max(1),
  position_delta: z.number().min(-100).max(100),
});

export const gscRecommendationSchema = z.object({
  type: recommendationTypeEnum,
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(5).max(300),
  description: z.string().min(10).max(2000),
});

export const gscDigestOutputSchema = z.object({
  summary: z.string(),
  top_changes: z.array(gscChangeSchema),
  recommendations: z.array(gscRecommendationSchema),
});

export const actionDraftGeneratorOutputSchema = z.object({
  type: actionTypeEnum,
  payload: z.record(z.unknown()).refine(
    (obj) => {
      const keys = Object.keys(obj);
      return keys.length >= 1 && keys.length <= 20;
    },
    { message: 'payload must have between 1 and 20 keys' },
  ),
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
    type: recommendationTypeEnum,
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
    type: recommendationTypeEnum,
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
    type: recommendationTypeEnum,
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

// Brand Profile auto-detection output
export const brandProfileOutputSchema = z.object({
  industry: z.string(),
  description: z.string(),
  target_audience: z.string(),
  keywords: z.array(z.string()),
  competitors: z.array(z.string()),
});

// Trend relevance + sensitivity filter output
export const trendFilterItemSchema = z.object({
  index: z.number(),
  relevant: z.boolean(),
  sensitive: z.boolean(),
  relevance_reason: z.string(),
  sensitivity_flag: z.string().optional(),
  suggested_angle: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

export const trendFilterOutputSchema = z.object({
  filtered_trends: z.array(trendFilterItemSchema),
});

export type BrandProfileOutput = z.infer<typeof brandProfileOutputSchema>;
export type TrendFilterOutput = z.infer<typeof trendFilterOutputSchema>;
export type TrendFilterItem = z.infer<typeof trendFilterItemSchema>;

// Trend Content Brief (multi-platform enrichment for trend scan recommendations)
export const trendContentBriefSchema = z.object({
  headline_options: z.array(z.object({
    headline: z.string(),
    platform: z.enum(['blog', 'twitter', 'linkedin', 'email', 'general']),
    hook_type: z.enum(['question', 'statistic', 'bold_claim', 'how_to', 'news_peg', 'contrarian']),
  })).min(2).max(5),

  content_outline: z.array(z.object({
    heading: z.string(),
    key_points: z.array(z.string()),
    estimated_word_count: z.number(),
  })),

  platform_angles: z.object({
    blog: z.object({
      format: z.string(),
      word_count: z.number(),
      seo_title: z.string(),
      meta_description: z.string(),
    }).optional(),
    social: z.object({
      twitter_hook: z.string(),
      linkedin_angle: z.string(),
      instagram_caption: z.string().optional(),
    }).optional(),
    email: z.object({
      subject_lines: z.array(z.string()).min(1).max(3),
      preview_text: z.string(),
      newsletter_angle: z.string(),
    }).optional(),
  }),

  suggested_keywords: z.array(z.object({
    keyword: z.string(),
    intent: z.enum(['informational', 'navigational', 'transactional', 'commercial']),
    priority: z.enum(['primary', 'secondary', 'long_tail']),
  })),

  tone_guidance: z.object({
    recommended_tone: z.string(),
    voice_notes: z.string(),
    things_to_avoid: z.array(z.string()),
  }),

  timeliness: z.object({
    urgency: z.enum(['immediate', 'this_week', 'this_month', 'evergreen']),
    publish_window: z.string(),
    trend_lifecycle_stage: z.enum(['emerging', 'peaking', 'sustained', 'declining']),
  }),
});

export type TrendContentBrief = z.infer<typeof trendContentBriefSchema>;

export type ContentOptimizerOutput = z.infer<typeof contentOptimizerOutputSchema>;
export type AdsPerformanceOutput = z.infer<typeof adsPerformanceOutputSchema>;
export type AnalyticsInsightsOutput = z.infer<typeof analyticsInsightsOutputSchema>;
export type CrossChannelCorrelationOutput = z.infer<typeof crossChannelCorrelationSchema>;
export type CapabilityGapOutput = z.infer<typeof capabilityGapOutputSchema>;
