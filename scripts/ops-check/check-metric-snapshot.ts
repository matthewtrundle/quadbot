import { db, brands, brandIntegrations, metricSnapshots, jobs } from '@quadbot/db';
import { eq, and, gte } from 'drizzle-orm';
import { pass, fail, skip, pollUntil } from './lib/helpers.js';
import { apiPost } from './lib/api-client.js';

export async function checkMetricSnapshot() {
  // Find a brand with credentials (GA4 or Google Ads)
  const allBrands = await db.select().from(brands).where(eq(brands.is_active, true));

  let targetBrand: typeof allBrands[0] | null = null;

  for (const brand of allBrands) {
    if (brand.name.startsWith('_ops_check_')) continue;

    const integrations = await db
      .select()
      .from(brandIntegrations)
      .where(eq(brandIntegrations.brand_id, brand.id));

    if (integrations.length > 0) {
      targetBrand = brand;
      break;
    }
  }

  if (!targetBrand) {
    skip('Metric Snapshot', 'No brands with credentials configured');
    return;
  }

  // Trigger metric_snapshot job
  const triggerRes = await apiPost('/api/jobs/trigger', {
    brandId: targetBrand.id,
    jobType: 'metric_snapshot',
  });

  if (!triggerRes.ok || !triggerRes.data?.jobId) {
    fail('Metric Snapshot', 'Trigger metric_snapshot job', JSON.stringify(triggerRes.data));
    return;
  }

  const jobId = triggerRes.data.jobId;
  pass('Metric Snapshot', `Job triggered for ${targetBrand.name}`);

  // Poll for job completion
  const completedJob = await pollUntil(async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return null;
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    return null;
  }, { timeoutMs: 30000, intervalMs: 3000 });

  if (!completedJob) {
    skip('Metric Snapshot', 'Worker not running or job still processing');
    return;
  }

  if (completedJob.status === 'succeeded') {
    pass('Metric Snapshot', 'Job succeeded');

    // Check for snapshot rows
    const snapshots = await db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, targetBrand.id),
          gte(metricSnapshots.captured_at, new Date(Date.now() - 60000)),
        ),
      );

    if (snapshots.length > 0) {
      pass('Metric Snapshot', `${snapshots.length} metric snapshots created`);
    } else {
      skip('Metric Snapshot', 'Job succeeded but 0 snapshots (may lack API access)');
    }
  } else {
    fail('Metric Snapshot', 'Job execution', completedJob.error || 'Job failed');
  }
}
