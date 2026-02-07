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
} from 'drizzle-orm/pg-core';

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

export const brandIntegrations = pgTable('brand_integrations', {
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
});

export const jobs = pgTable('jobs', {
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
});

export const recommendations = pgTable('recommendations', {
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
});

export const actionDrafts = pgTable('action_drafts', {
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
});

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

export const events = pgTable('events', {
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
});

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

// Phase 5: Decision Engine

export const playbooks = pgTable('playbooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  domain: varchar('domain', { length: 100 }).notNull(),
  trigger_conditions: jsonb('trigger_conditions').$type<Record<string, unknown>>().notNull(),
  recommended_actions: jsonb('recommended_actions').$type<Record<string, unknown>[]>().notNull(),
  examples: jsonb('examples').$type<Record<string, unknown>[]>().default([]),
  version: integer('version').notNull().default(1),
  is_active: boolean('is_active').notNull().default(true),
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

export const metricSnapshots = pgTable('metric_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  brand_id: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 50 }).notNull(),
  metric_key: varchar('metric_key', { length: 100 }).notNull(),
  value: real('value').notNull(),
  dimensions: jsonb('dimensions').$type<Record<string, unknown>>().default({}),
  captured_at: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
});

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
