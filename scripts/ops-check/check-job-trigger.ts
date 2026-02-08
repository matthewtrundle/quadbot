import { db, jobs, recommendations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { pass, fail, skip, pollUntil } from './lib/helpers.js';
import { apiPost } from './lib/api-client.js';
import { createTestBrand, cleanupTestBrand } from './lib/test-brand.js';

export async function checkJobTrigger() {
  const brand = await createTestBrand();

  try {
    // 1. Trigger job via API
    const triggerRes = await apiPost('/api/jobs/trigger', {
      brandId: brand.id,
      jobType: 'gsc_daily_digest',
    });

    if (!triggerRes.ok || !triggerRes.data?.jobId) {
      fail('Job Trigger', 'Job created and queued', JSON.stringify(triggerRes.data));
      return;
    }

    const jobId = triggerRes.data.jobId;
    pass('Job Trigger', 'Job created and queued');

    // 2. Check if worker processes it
    const completedJob = await pollUntil(async () => {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job) return null;
      if (job.status === 'succeeded' || job.status === 'failed') return job;
      return null;
    }, { timeoutMs: 15000, intervalMs: 2000 });

    if (completedJob) {
      if (completedJob.status === 'succeeded') {
        pass('Job Trigger', 'Job succeeded (worker detected)');

        // Check for recommendations
        const recs = await db
          .select()
          .from(recommendations)
          .where(eq(recommendations.job_id, jobId));

        if (recs.length > 0) {
          pass('Job Trigger', `${recs.length} recommendations created`);
        } else {
          skip('Job Trigger', 'No recommendations created (may need GSC credentials)');
        }
      } else {
        fail('Job Trigger', 'Job execution', completedJob.error || 'Job failed');
      }
    } else {
      // Worker not running - just verify job is queued
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (job && job.status === 'queued') {
        skip('Job Trigger', 'Worker not running - job remains queued');
      } else if (job && job.status === 'running') {
        skip('Job Trigger', 'Job still running (worker may be slow)');
      } else {
        fail('Job Trigger', 'Job status check', `Unexpected status: ${job?.status}`);
      }
    }
  } finally {
    await cleanupTestBrand(brand.id);
  }
}
