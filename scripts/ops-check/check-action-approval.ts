import { db, recommendations, actionDrafts, actionExecutions, jobs } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { pass, fail, skip, pollUntil } from './lib/helpers.js';
import { apiPost } from './lib/api-client.js';
import { createTestBrand, cleanupTestBrand } from './lib/test-brand.js';

export async function checkActionApproval() {
  const brand = await createTestBrand();

  try {
    // Create test job
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      brand_id: brand.id,
      type: 'gsc_daily_digest',
      status: 'succeeded',
      payload: {},
    });

    // Create test recommendation
    const recId = randomUUID();
    await db.insert(recommendations).values({
      id: recId,
      brand_id: brand.id,
      job_id: jobId,
      source: 'ops_check',
      priority: 'medium',
      title: 'Test recommendation for ops check',
      body: 'This is an automated test recommendation.',
    });

    // Create test action draft
    const actionId = randomUUID();
    await db.insert(actionDrafts).values({
      id: actionId,
      brand_id: brand.id,
      recommendation_id: recId,
      type: 'test_action',
      payload: { test: true },
      risk: 'low',
      status: 'pending',
    });

    // Approve via API
    const approveRes = await apiPost(`/api/actions/${actionId}/approve`);

    if (approveRes.ok) {
      pass('Action Approval', 'Draft approved via API');
    } else {
      fail('Action Approval', 'Draft approved via API', JSON.stringify(approveRes.data));
      return;
    }

    // Verify status changed
    const [draft] = await db
      .select()
      .from(actionDrafts)
      .where(eq(actionDrafts.id, actionId))
      .limit(1);

    if (draft?.status === 'approved') {
      pass('Action Approval', 'Status changed to approved');
    } else {
      fail('Action Approval', 'Status changed to approved', `Got: ${draft?.status}`);
    }

    // Check if execution loop picks it up (wait up to 40s)
    const execution = await pollUntil(async () => {
      const [exec] = await db
        .select()
        .from(actionExecutions)
        .where(eq(actionExecutions.action_draft_id, actionId))
        .limit(1);
      return exec || null;
    }, { timeoutMs: 40000, intervalMs: 3000 });

    if (execution) {
      pass('Action Approval', 'Execution loop processed');
    } else {
      skip('Action Approval', 'Execution loop not detected (worker may not be running)');
    }
  } finally {
    await cleanupTestBrand(brand.id);
  }
}
