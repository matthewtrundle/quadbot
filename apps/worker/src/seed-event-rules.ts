import { db } from '@quadbot/db';
import { eventRules } from '@quadbot/db';
import { EventType, JobType } from '@quadbot/shared';
import { logger } from './logger.js';

/**
 * Default global event rules that make the pipeline autonomous.
 * Global rules (brand_id = null) apply to all brands.
 *
 * Pipeline flow:
 *   recommendation.created → action_draft_generator  (generate actions for new recs)
 *   outcome.collected      → signal_extractor        (learn from measured outcomes)
 */
const DEFAULT_RULES = [
  {
    event_type: EventType.RECOMMENDATION_CREATED,
    job_type: JobType.ACTION_DRAFT_GENERATOR,
    conditions: {},
    enabled: true,
  },
  {
    event_type: EventType.OUTCOME_COLLECTED,
    job_type: JobType.SIGNAL_EXTRACTOR,
    conditions: {},
    enabled: true,
  },
];

export async function seedEventRules(): Promise<void> {
  logger.info('Checking default event rules...');

  for (const rule of DEFAULT_RULES) {
    // Check if a global rule for this event_type → job_type already exists
    const existing = await db.query.eventRules.findFirst({
      where: (er, { eq: e, and: a, isNull }) =>
        a(
          e(er.event_type, rule.event_type),
          e(er.job_type, rule.job_type),
          isNull(er.brand_id),
        ),
    });

    if (existing) {
      logger.debug(
        { eventType: rule.event_type, jobType: rule.job_type },
        'Event rule already exists',
      );
      continue;
    }

    await db.insert(eventRules).values({
      brand_id: null,
      event_type: rule.event_type,
      job_type: rule.job_type,
      conditions: rule.conditions,
      enabled: rule.enabled,
    });

    logger.info(
      { eventType: rule.event_type, jobType: rule.job_type },
      'Seeded global event rule',
    );
  }
}
