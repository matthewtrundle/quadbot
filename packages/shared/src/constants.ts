export const Mode = {
  OBSERVE: 'observe',
  ASSIST: 'assist',
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const JobType = {
  COMMUNITY_MODERATE_POST: 'community_moderate_post',
  GSC_DAILY_DIGEST: 'gsc_daily_digest',
  TREND_SCAN_INDUSTRY: 'trend_scan_industry',
  ACTION_DRAFT_GENERATOR: 'action_draft_generator',
  OUTCOME_COLLECTOR: 'outcome_collector',
  PROMPT_SCORER: 'prompt_scorer',
  // Phase 3: Evaluation
  METRIC_SNAPSHOT: 'metric_snapshot',
  EVALUATION_SCORER: 'evaluation_scorer',
  // Phase 4: Brand Brain
  SIGNAL_EXTRACTOR: 'signal_extractor',
  // Phase 5: Decision Engine
  STRATEGIC_PRIORITIZER: 'strategic_prioritizer',
  // Phase 6: Content Generation
  CONTENT_OPTIMIZER: 'content_optimizer',
  // Phase 7: Multi-Source Intelligence
  ADS_PERFORMANCE_DIGEST: 'ads_performance_digest',
  ANALYTICS_INSIGHTS: 'analytics_insights',
  CROSS_CHANNEL_CORRELATOR: 'cross_channel_correlator',
  // Phase 8: Self-Improvement Engine
  CAPABILITY_GAP_ANALYZER: 'capability_gap_analyzer',
  // Brand profiler (on-demand)
  BRAND_PROFILER: 'brand_profiler',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ActionDraftStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED_STUB: 'executed_stub',
  EXECUTED: 'executed',
} as const;
export type ActionDraftStatus = (typeof ActionDraftStatus)[keyof typeof ActionDraftStatus];

export const RecommendationPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type RecommendationPriority = (typeof RecommendationPriority)[keyof typeof RecommendationPriority];

export const IntegrationType = {
  GOOGLE_SEARCH_CONSOLE: 'google_search_console',
  GOOGLE_ADS: 'google_ads',
  GOOGLE_ANALYTICS: 'google_analytics',
  GOOGLE_BUSINESS_PROFILE: 'google_business_profile',
  COMMUNITY_WEBHOOK: 'community_webhook',
} as const;
export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType];

// Phase 2: Event Types
export const EventType = {
  WEBHOOK_RECEIVED: 'webhook.received',
  RECOMMENDATION_CREATED: 'recommendation.created',
  ACTION_DRAFT_CREATED: 'action_draft.created',
  ACTION_DRAFT_APPROVED: 'action_draft.approved',
  ACTION_DRAFT_REJECTED: 'action_draft.rejected',
  ACTION_EXECUTED: 'action.executed',
  OUTCOME_COLLECTED: 'outcome.collected',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const QUEUE_KEY = 'quadbot:jobs';
export const DLQ_KEY = 'quadbot:dlq';
export const MAX_ATTEMPTS = 5;
