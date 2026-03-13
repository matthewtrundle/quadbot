import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  real,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Parse "[1,2,3]" format from postgres
    return value
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(Number);
  },
});

export const modeEnum = pgEnum('mode', ['observe', 'assist']);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'critical']);
export const actionDraftStatusEnum = pgEnum('action_draft_status', [
  'pending',
  'approved',
  'rejected',
  'executed_stub',
  'executed',
]);
export const riskEnum = pgEnum('risk', ['low', 'medium', 'high']);

// GSC Auto-Import: Shared Credentials
export const sharedCredentials = pgTable('shared_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  credentials_encrypted: text('credentials_encrypted').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const brands = pgTable('brands', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  mode: modeEnum('mode').notNull().default('observe'),
  is_active: boolean('is_active').notNull().default(true),
  modules_enabled: jsonb('modules_enabled').$type<string[]>().default([]),
  guardrails: jsonb('guardrails').$type<Record<string, unknown>>().default({}),
  time_budget_minutes_per_day: integer('time_budget_minutes_per_day').default(30),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const brandIntegrations = pgTable(
  'brand_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    credentials_encrypted: text('credentials_encrypted'),
    shared_credential_id: uuid('shared_credential_id').references(() => sharedCredentials.id),
    config: jsonb('config').$type<Record<string, unknown>>().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_brand_integrations_brand_type').on(table.brand_id, table.type)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    result: jsonb('result').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_jobs_status').on(table.status),
    index('idx_jobs_brand_status').on(table.brand_id, table.status),
    index('idx_jobs_brand_created').on(table.brand_id, table.created_at),
  ],
);

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 100 }).notNull(),
    priority: priorityEnum('priority').notNull().default('medium'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().default({}),
    model_meta: jsonb('model_meta').$type<Record<string, unknown>>(),
    confidence: real('confidence'),
    evaluation_score: real('evaluation_score'),
    roi_score: real('roi_score'),
    effort_estimate: varchar('effort_estimate', { length: 20 }),
    strategic_alignment: real('strategic_alignment'),
    priority_rank: integer('priority_rank'),
    base_score: real('base_score'),
    claude_delta: real('claude_delta'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    dismissed_at: timestamp('dismissed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_recommendations_brand_created').on(table.brand_id, table.created_at),
    index('idx_recommendations_brand_source').on(table.brand_id, table.source),
  ],
);

export const actionDrafts = pgTable(
  'action_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    recommendation_id: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    risk: riskEnum('risk').notNull().default('medium'),
    guardrails_applied: jsonb('guardrails_applied').$type<Record<string, unknown>>().default({}),
    requires_approval: boolean('requires_approval').notNull().default(true),
    predicted_impact: real('predicted_impact'),
    actual_impact: real('actual_impact'),
    status: actionDraftStatusEnum('status').notNull().default('pending'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_action_drafts_status').on(table.status),
    index('idx_action_drafts_brand_status').on(table.brand_id, table.status),
  ],
);

export const actionExecutions = pgTable('action_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  action_draft_id: uuid('action_draft_id')
    .notNull()
    .references(() => actionDrafts.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('stubbed'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  executed_at: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const outcomes = pgTable('outcomes', {
  id: uuid('id').defaultRandom().primaryKey(),
  recommendation_id: uuid('recommendation_id')
    .notNull()
    .references(() => recommendations.id, { onDelete: 'cascade' }),
  metric_name: varchar('metric_name', { length: 255 }).notNull(),
  metric_value_before: real('metric_value_before'),
  metric_value_after: real('metric_value_after'),
  delta: real('delta'),
  measured_at: timestamp('measured_at', { withTimezone: true }).defaultNow().notNull(),
});

export const promptVersions = pgTable('prompt_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  version: integer('version').notNull().default(1),
  system_prompt: text('system_prompt').notNull(),
  user_prompt_template: text('user_prompt_template').notNull(),
  model: varchar('model', { length: 100 }).notNull().default('claude-sonnet-4-20250514'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 1: Multi-Tenant Hardening

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  key_hash: varchar('key_hash', { length: 64 }).notNull(),
  key_prefix: varchar('key_prefix', { length: 8 }).notNull(),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 2: Event-Driven Architecture

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    source: varchar('source', { length: 100 }),
    dedupe_key: text('dedupe_key'),
    status: varchar('status', { length: 20 }).notNull().default('new'),
    attempts: integer('attempts').notNull().default(0),
    last_error: text('last_error'),
    processed_at: timestamp('processed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_events_status').on(table.status),
    index('idx_events_brand_type').on(table.brand_id, table.type),
    uniqueIndex('idx_events_dedupe').on(table.brand_id, table.type, table.dedupe_key),
  ],
);

export const eventRules = pgTable('event_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  event_type: varchar('event_type', { length: 100 }).notNull(),
  job_type: varchar('job_type', { length: 100 }).notNull(),
  conditions: jsonb('conditions').$type<Record<string, unknown>>().default({}),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 6: Artifacts

export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  recommendation_id: uuid('recommendation_id').references(() => recommendations.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 100 }).notNull(),
  title: text('title').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  version: integer('version').notNull().default(1),
  parent_artifact_id: uuid('parent_artifact_id'),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 4: Brand Brain

export const signals = pgTable('signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  source_brand_id: uuid('source_brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 100 }).notNull(),
  signal_type: varchar('signal_type', { length: 100 }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  confidence: real('confidence').notNull(),
  decay_weight: real('decay_weight').notNull().default(1.0),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const signalApplications = pgTable('signal_applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  signal_id: uuid('signal_id')
    .notNull()
    .references(() => signals.id, { onDelete: 'cascade' }),
  target_brand_id: uuid('target_brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  recommendation_id: uuid('recommendation_id').references(() => recommendations.id, { onDelete: 'set null' }),
  applied_at: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
  outcome_positive: boolean('outcome_positive'),
});

// Phase 3: Metric Snapshots + Evaluation

export const metricSnapshots = pgTable(
  'metric_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 50 }).notNull(),
    metric_key: varchar('metric_key', { length: 100 }).notNull(),
    value: real('value').notNull(),
    dimensions: jsonb('dimensions').$type<Record<string, unknown>>().default({}),
    captured_at: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_metric_snapshots_brand_source').on(table.brand_id, table.source),
    index('idx_metric_snapshots_brand_captured').on(table.brand_id, table.captured_at),
  ],
);

export const evaluationRuns = pgTable('evaluation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  period_start: timestamp('period_start', { withTimezone: true }).notNull(),
  period_end: timestamp('period_end', { withTimezone: true }).notNull(),
  total_recommendations: integer('total_recommendations').notNull().default(0),
  acceptance_rate: real('acceptance_rate'),
  avg_confidence: real('avg_confidence'),
  calibration_error: real('calibration_error'),
  avg_outcome_delta: real('avg_outcome_delta'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 5: Learning Loop Enhancement Tables

export const promptPerformance = pgTable('prompt_performance', {
  id: uuid('id').defaultRandom().primaryKey(),
  prompt_version_id: uuid('prompt_version_id')
    .notNull()
    .references(() => promptVersions.id, { onDelete: 'cascade' }),
  period_start: timestamp('period_start', { withTimezone: true }).notNull(),
  period_end: timestamp('period_end', { withTimezone: true }).notNull(),
  total_recommendations: integer('total_recommendations').notNull().default(0),
  accepted_count: integer('accepted_count').notNull().default(0),
  acceptance_rate: real('acceptance_rate'),
  avg_outcome_delta: real('avg_outcome_delta'),
  confidence_accuracy: real('confidence_accuracy'),
  effectiveness_score: real('effectiveness_score'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const executionRules = pgTable('execution_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  min_confidence: real('min_confidence').notNull().default(0.9),
  max_risk: varchar('max_risk', { length: 10 }).notNull().default('low'),
  allowed_action_types: jsonb('allowed_action_types').$type<string[]>().default([]),
  auto_execute: boolean('auto_execute').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Phase 2: Execution Safety + Notifications

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().default({}),
    read: boolean('read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_brand_read').on(table.brand_id, table.read),
    index('idx_notifications_brand_created').on(table.brand_id, table.created_at),
  ],
);

export const executionBudgets = pgTable('execution_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(),
  executions_count: integer('executions_count').notNull().default(0),
  spend_delta_cents: integer('spend_delta_cents').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Self-Improvement Engine

export const improvementSuggestions = pgTable('improvement_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 100 }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  rationale: text('rationale').notNull(),
  expected_impact: text('expected_impact').notNull(),
  implementation_effort: varchar('implementation_effort', { length: 20 }).notNull(),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().default({}),
  user_feedback: text('user_feedback'),
  votes: integer('votes').notNull().default(0),
  source_job_id: uuid('source_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Better Auth tables

export const users = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    role: varchar('role', { length: 20 }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_user_brand_id').on(table.brandId)],
);

export const sessions = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('idx_session_user_id').on(table.userId), index('idx_session_token').on(table.token)],
);

export const accounts = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_account_user_id').on(table.userId)],
);

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const improvementOutcomes = pgTable('improvement_outcomes', {
  id: uuid('id').defaultRandom().primaryKey(),
  suggestion_id: uuid('suggestion_id')
    .notNull()
    .references(() => improvementSuggestions.id, { onDelete: 'cascade' }),
  implemented_at: timestamp('implemented_at', { withTimezone: true }).notNull(),
  before_metrics: jsonb('before_metrics').$type<Record<string, unknown>>().notNull(),
  after_metrics: jsonb('after_metrics').$type<Record<string, unknown>>(),
  measured_at: timestamp('measured_at', { withTimezone: true }),
  improvement_delta: jsonb('improvement_delta').$type<Record<string, unknown>>(),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// Outreach Module (Email Outreach System)
// ============================================================================

export const outreachAccountStatusEnum = pgEnum('outreach_account_status', ['active', 'paused', 'disabled']);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'active', 'paused', 'completed', 'archived']);
export const campaignReplyModeEnum = pgEnum('campaign_reply_mode', ['manual', 'ai_draft_approve', 'ai_auto_reply']);
export const campaignLeadStatusEnum = pgEnum('campaign_lead_status', [
  'pending',
  'scheduled',
  'sending',
  'sent',
  'replied',
  'completed',
  'bounced',
  'unsubscribed',
  'error',
]);
export const outreachEmailStatusEnum = pgEnum('outreach_email_status', [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
]);
export const outreachMessageDirectionEnum = pgEnum('outreach_message_direction', ['outbound', 'inbound']);
export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'resolved', 'archived']);

export const outreachAccounts = pgTable(
  'outreach_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    from_name: varchar('from_name', { length: 255 }).notNull(),
    resend_api_key_encrypted: text('resend_api_key_encrypted').notNull(),
    daily_limit: integer('daily_limit').notNull().default(50),
    sent_today: integer('sent_today').notNull().default(0),
    sent_today_date: varchar('sent_today_date', { length: 10 }),
    status: outreachAccountStatusEnum('status').notNull().default('active'),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    total_sent: integer('total_sent').notNull().default(0),
    total_bounced: integer('total_bounced').notNull().default(0),
    total_complained: integer('total_complained').notNull().default(0),
    bounce_rate: real('bounce_rate').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_outreach_accounts_brand').on(table.brand_id),
    index('idx_outreach_accounts_brand_status').on(table.brand_id, table.status),
    uniqueIndex('idx_outreach_accounts_brand_email').on(table.brand_id, table.email),
  ],
);

export const leadLists = pgTable(
  'lead_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    original_filename: varchar('original_filename', { length: 500 }),
    total_rows: integer('total_rows').notNull().default(0),
    imported_count: integer('imported_count').notNull().default(0),
    duplicate_count: integer('duplicate_count').notNull().default(0),
    error_count: integer('error_count').notNull().default(0),
    column_mapping: jsonb('column_mapping').$type<Record<string, string>>().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_lead_lists_brand').on(table.brand_id)],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    lead_list_id: uuid('lead_list_id').references(() => leadLists.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull(),
    first_name: varchar('first_name', { length: 255 }),
    last_name: varchar('last_name', { length: 255 }),
    company: varchar('company', { length: 255 }),
    title: varchar('title', { length: 255 }),
    linkedin_url: varchar('linkedin_url', { length: 500 }),
    phone: varchar('phone', { length: 50 }),
    industry: varchar('industry', { length: 255 }),
    employee_count: varchar('employee_count', { length: 50 }),
    location: varchar('location', { length: 255 }),
    custom_fields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
    is_unsubscribed: boolean('is_unsubscribed').notNull().default(false),
    is_bounced: boolean('is_bounced').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_leads_brand_email').on(table.brand_id, table.email),
    index('idx_leads_lead_list').on(table.lead_list_id),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: campaignStatusEnum('status').notNull().default('draft'),
    reply_mode: campaignReplyModeEnum('reply_mode').notNull().default('manual'),
    ai_reply_context: text('ai_reply_context'),
    ai_reply_tone: varchar('ai_reply_tone', { length: 100 }),
    timezone: varchar('timezone', { length: 100 }).notNull().default('America/Chicago'),
    send_days: jsonb('send_days').$type<number[]>().default([1, 2, 3, 4, 5]),
    send_window_start: varchar('send_window_start', { length: 5 }).notNull().default('09:00'),
    send_window_end: varchar('send_window_end', { length: 5 }).notNull().default('17:00'),
    daily_send_limit: integer('daily_send_limit').notNull().default(50),
    min_spacing_seconds: integer('min_spacing_seconds').notNull().default(60),
    max_spacing_seconds: integer('max_spacing_seconds').notNull().default(300),
    sent_today: integer('sent_today').notNull().default(0),
    sent_today_date: varchar('sent_today_date', { length: 10 }),
    total_sent: integer('total_sent').notNull().default(0),
    total_leads: integer('total_leads').notNull().default(0),
    started_at: timestamp('started_at', { withTimezone: true }),
    paused_at: timestamp('paused_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_campaigns_brand').on(table.brand_id),
    index('idx_campaigns_brand_status').on(table.brand_id, table.status),
  ],
);

export const campaignSequenceSteps = pgTable(
  'campaign_sequence_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    step_order: integer('step_order').notNull(),
    delay_days: integer('delay_days').notNull().default(1),
    subject_template: text('subject_template').notNull(),
    body_template: text('body_template').notNull(),
    is_reply_to_previous: boolean('is_reply_to_previous').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_campaign_steps_campaign_order').on(table.campaign_id, table.step_order)],
);

export const campaignLeads = pgTable(
  'campaign_leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    lead_id: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    outreach_account_id: uuid('outreach_account_id').references(() => outreachAccounts.id, { onDelete: 'set null' }),
    current_step: integer('current_step').notNull().default(0),
    status: campaignLeadStatusEnum('status').notNull().default('pending'),
    next_send_at: timestamp('next_send_at', { withTimezone: true }),
    paused_at: timestamp('paused_at', { withTimezone: true }),
    pause_reason: text('pause_reason'),
    enrolled_at: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
    last_sent_at: timestamp('last_sent_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_campaign_leads_campaign_lead').on(table.campaign_id, table.lead_id),
    index('idx_campaign_leads_status_next_send').on(table.status, table.next_send_at),
    index('idx_campaign_leads_campaign_status').on(table.campaign_id, table.status),
  ],
);

export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    campaign_lead_id: uuid('campaign_lead_id')
      .notNull()
      .references(() => campaignLeads.id, { onDelete: 'cascade' }),
    outreach_account_id: uuid('outreach_account_id')
      .notNull()
      .references(() => outreachAccounts.id, { onDelete: 'cascade' }),
    step_order: integer('step_order').notNull(),
    from_email: varchar('from_email', { length: 255 }).notNull(),
    from_name: varchar('from_name', { length: 255 }).notNull(),
    to_email: varchar('to_email', { length: 255 }).notNull(),
    subject: text('subject').notNull(),
    body_html: text('body_html').notNull(),
    body_text: text('body_text'),
    resend_message_id: varchar('resend_message_id', { length: 255 }),
    message_id_header: varchar('message_id_header', { length: 500 }),
    in_reply_to_header: varchar('in_reply_to_header', { length: 500 }),
    status: outreachEmailStatusEnum('status').notNull().default('queued'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    opened_at: timestamp('opened_at', { withTimezone: true }),
    clicked_at: timestamp('clicked_at', { withTimezone: true }),
    bounced_at: timestamp('bounced_at', { withTimezone: true }),
    complained_at: timestamp('complained_at', { withTimezone: true }),
    open_count: integer('open_count').notNull().default(0),
    click_count: integer('click_count').notNull().default(0),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_outreach_emails_resend_id').on(table.resend_message_id),
    index('idx_outreach_emails_message_id').on(table.message_id_header),
    index('idx_outreach_emails_to_email').on(table.to_email),
    index('idx_outreach_emails_campaign').on(table.campaign_id),
    index('idx_outreach_emails_brand').on(table.brand_id),
  ],
);

export const outreachConversations = pgTable(
  'outreach_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    lead_id: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    campaign_lead_id: uuid('campaign_lead_id').references(() => campaignLeads.id, { onDelete: 'set null' }),
    status: conversationStatusEnum('status').notNull().default('active'),
    last_message_at: timestamp('last_message_at', { withTimezone: true }),
    message_count: integer('message_count').notNull().default(0),
    ai_draft_pending: boolean('ai_draft_pending').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_outreach_conversations_campaign_lead').on(table.campaign_id, table.lead_id),
    index('idx_outreach_conversations_brand').on(table.brand_id),
  ],
);

export const outreachMessages = pgTable(
  'outreach_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => outreachConversations.id, { onDelete: 'cascade' }),
    direction: outreachMessageDirectionEnum('direction').notNull(),
    subject: text('subject'),
    body_text: text('body_text'),
    body_html: text('body_html'),
    outreach_email_id: uuid('outreach_email_id').references(() => outreachEmails.id, { onDelete: 'set null' }),
    from_email: varchar('from_email', { length: 255 }),
    resend_inbound_id: varchar('resend_inbound_id', { length: 255 }),
    raw_headers: jsonb('raw_headers').$type<Record<string, unknown>>(),
    ai_generated: boolean('ai_generated').notNull().default(false),
    ai_approved: boolean('ai_approved'),
    ai_approved_at: timestamp('ai_approved_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_outreach_messages_conversation').on(table.conversation_id)],
);

// Phase 5: LLM Usage Tracking
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    prompt_version_id: uuid('prompt_version_id').references(() => promptVersions.id, { onDelete: 'set null' }),
    model: varchar('model', { length: 100 }).notNull(),
    input_tokens: integer('input_tokens').notNull(),
    output_tokens: integer('output_tokens').notNull(),
    cost_cents: real('cost_cents').notNull().default(0),
    latency_ms: integer('latency_ms'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_llm_usage_brand').on(table.brand_id), index('idx_llm_usage_created').on(table.created_at)],
);

// Phase 7A: Playbooks
export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    trigger_type: varchar('trigger_type', { length: 100 }).notNull(),
    trigger_conditions: jsonb('trigger_conditions').$type<Record<string, unknown>>().notNull().default({}),
    actions: jsonb('actions').$type<Record<string, unknown>[]>().notNull().default([]),
    is_active: boolean('is_active').notNull().default(true),
    run_count: integer('run_count').notNull().default(0),
    last_run_at: timestamp('last_run_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_playbooks_brand').on(table.brand_id)],
);

// Phase 8C: Outgoing Webhooks
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    event_types: jsonb('event_types').$type<string[]>().notNull().default([]),
    secret: varchar('secret', { length: 255 }), // HMAC signing secret
    is_active: boolean('is_active').notNull().default(true),
    last_triggered_at: timestamp('last_triggered_at', { withTimezone: true }),
    failure_count: integer('failure_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_webhooks_brand').on(table.brand_id)],
);

// Phase 2: Next-Level Features — Embeddings (pgvector)
export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    source_type: varchar('source_type', { length: 100 }).notNull(),
    source_id: uuid('source_id').notNull(),
    content_hash: varchar('content_hash', { length: 64 }).notNull(),
    content_preview: text('content_preview'),
    embedding: vector('embedding'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_embeddings_brand_source').on(table.brand_id, table.source_type),
    index('idx_embeddings_source_id').on(table.source_id),
    uniqueIndex('idx_embeddings_content_hash').on(
      table.brand_id,
      table.source_type,
      table.source_id,
      table.content_hash,
    ),
  ],
);

// Phase 2: Next-Level Features — Competitor Snapshots
export const competitorSnapshots = pgTable(
  'competitor_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    competitor_domain: varchar('competitor_domain', { length: 255 }).notNull(),
    page_url: text('page_url').notNull(),
    title: text('title'),
    meta_description: text('meta_description'),
    content_hash: varchar('content_hash', { length: 64 }),
    word_count: integer('word_count'),
    headings: jsonb('headings').$type<Record<string, unknown>>(),
    schema_types: jsonb('schema_types').$type<string[]>(),
    captured_at: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_competitor_snapshots_brand').on(table.brand_id),
    index('idx_competitor_snapshots_domain').on(table.brand_id, table.competitor_domain),
  ],
);

// === CMS / Publishing Configuration ===

export const contentPublishConfigs = pgTable(
  'content_publish_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    config: jsonb('config')
      .$type<{
        owner: string;
        repo: string;
        branch: string;
        blog_directory: string;
        content_format: 'nextjs_page' | 'mdx' | 'markdown';
        site_url: string;
        auto_merge: boolean;
        template_path?: string;
      }>()
      .notNull(),
    github_token_encrypted: text('github_token_encrypted'),
    is_active: boolean('is_active').default(true).notNull(),
    last_published_at: timestamp('last_published_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_content_publish_configs_brand').on(table.brand_id)],
);
