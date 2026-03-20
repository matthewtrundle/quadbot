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
  // Source Quality & Feedback
  SOURCE_QUALITY_SCORER: 'source_quality_scorer',
  // Email Digest
  DAILY_EMAIL_DIGEST: 'daily_email_digest',
  // Anomaly Detection
  ANOMALY_DETECTOR: 'anomaly_detector',
  // Weekly Summary
  WEEKLY_SUMMARY_EMAIL: 'weekly_summary_email',
  // Cross-Brand Benchmarks
  BENCHMARK_GENERATOR: 'benchmark_generator',
  // Content Automation Pipeline
  CONTENT_WRITER: 'content_writer',
  CONTENT_AUTOMATION: 'content_automation',
  // Outreach Module
  OUTREACH_CAMPAIGN_SCHEDULER: 'outreach_campaign_scheduler',
  OUTREACH_SEND_EMAIL: 'outreach_send_email',
  OUTREACH_PROCESS_REPLY: 'outreach_process_reply',
  OUTREACH_AI_REPLY: 'outreach_ai_reply',
  OUTREACH_CAMPAIGN_ANALYTICS: 'outreach_campaign_analytics',
  // Phase 2: Next-Level Features
  EMBEDDING_INDEXER: 'embedding_indexer',
  CONTENT_DECAY_DETECTOR: 'content_decay_detector',
  INTERNAL_LINKING: 'internal_linking',
  HUBSPOT_SYNC: 'hubspot_sync',
  SOCIAL_POST_PUBLISHER: 'social_post_publisher',
  COMPETITOR_MONITOR: 'competitor_monitor',
  SCHEMA_ORG_ANALYZER: 'schema_org_analyzer',
  PAGESPEED_MONITOR: 'pagespeed_monitor',
  // GEO / AI Search Visibility
  GEO_VISIBILITY_TRACKER: 'geo_visibility_tracker',
  CONTENT_GAP_ANALYZER: 'content_gap_analyzer',
  GBP_MONITOR: 'gbp_monitor',
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
  // Phase 2: Next-Level Features
  SLACK_WEBHOOK: 'slack_webhook',
  DISCORD_WEBHOOK: 'discord_webhook',
  HUBSPOT: 'hubspot',
  TWITTER: 'twitter',
  LINKEDIN: 'linkedin',
  // CMS Connectors
  GITHUB_CMS: 'github_cms',
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
  // Outreach Module
  OUTREACH_EMAIL_SENT: 'outreach.email.sent',
  OUTREACH_EMAIL_BOUNCED: 'outreach.email.bounced',
  OUTREACH_REPLY_RECEIVED: 'outreach.reply.received',
  OUTREACH_AI_REPLY_DRAFTED: 'outreach.ai_reply.drafted',
  OUTREACH_AI_REPLY_SENT: 'outreach.ai_reply.sent',
  OUTREACH_CAMPAIGN_COMPLETED: 'outreach.campaign.completed',
  // Phase 2: Next-Level Features
  JOB_COMPLETED: 'job.completed',
  ANOMALY_DETECTED: 'anomaly.detected',
  CONTENT_DECAY_DETECTED: 'content_decay.detected',
  // GEO / AI Search Visibility
  GEO_VISIBILITY_CHECKED: 'geo.visibility.checked',
  CONTENT_GAP_DETECTED: 'content_gap.detected',
  GBP_REVIEW_RECEIVED: 'gbp.review.received',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const QUEUE_KEY = 'quadbot:jobs';
export const DLQ_KEY = 'quadbot:dlq';
export const MAX_ATTEMPTS = 5;
