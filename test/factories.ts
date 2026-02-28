import { randomUUID } from 'crypto';

/**
 * Test data factories for creating common database entities.
 * Each factory returns a plain object matching the DB schema shape,
 * with sensible defaults that can be overridden.
 */

export function createBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: 'Test Brand',
    mode: 'observe' as const,
    is_active: true,
    modules_enabled: ['gsc_digest', 'trend_scan'],
    guardrails: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

export function createRecommendation(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    brand_id: randomUUID(),
    title: 'Test Recommendation',
    body: 'This is a test recommendation body.',
    source: 'gsc_daily_digest',
    priority: 'medium' as const,
    confidence: 0.8,
    status: 'active',
    data: {},
    created_at: new Date(),
    updated_at: new Date(),
    dismissed_at: null,
    ...overrides,
  };
}

export function createActionDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    brand_id: randomUUID(),
    recommendation_id: randomUUID(),
    type: 'content_optimization',
    risk: 'medium' as const,
    status: 'pending' as const,
    requires_approval: true,
    payload: {},
    created_at: new Date(),
    ...overrides,
  };
}

export function createOutcome(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    recommendation_id: randomUUID(),
    metric_name: 'avg_ctr',
    metric_value_before: 3.5,
    metric_value_after: 4.2,
    delta: 0.7,
    measured_at: new Date(),
    ...overrides,
  };
}

export function createSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    domain: 'seo',
    pattern: 'ctr_improvement',
    description: 'CTR improved after meta tag optimization',
    confidence: 0.85,
    evidence_count: 3,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    ...overrides,
  };
}

export function createJob(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    brand_id: randomUUID(),
    type: 'gsc_daily_digest',
    status: 'queued' as const,
    payload: {},
    result: null,
    error: null,
    started_at: null,
    completed_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

export function createMetricSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    brand_id: randomUUID(),
    source: 'gsc',
    metric_key: 'avg_ctr',
    value: 3.5,
    recorded_at: new Date(),
    ...overrides,
  };
}

export function createBrandIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    brand_id: randomUUID(),
    type: 'google_search_console',
    credentials: {},
    config: {},
    created_at: new Date(),
    ...overrides,
  };
}

/**
 * Helper to create a mock JobContext for worker tests.
 */
export function createJobContext(overrides: Record<string, unknown> = {}) {
  return {
    jobId: randomUUID(),
    brandId: randomUUID(),
    payload: {},
    ...overrides,
  };
}
