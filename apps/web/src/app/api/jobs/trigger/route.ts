import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { jobs, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { enqueueJob } from '@/lib/queue';
import { z } from 'zod';

const triggerSchema = z.object({
  brandId: z.string().uuid(),
  jobType: z.enum([
    'gsc_daily_digest',
    'trend_scan_industry',
    'metric_snapshot',
    'evaluation_scorer',
    'strategic_prioritizer',
    'content_optimizer',
    'ads_performance_digest',
    'analytics_insights',
    'cross_channel_correlator',
    'brand_profiler',
  ]),
});

/**
 * POST /api/jobs/trigger
 * Manually trigger a job for testing purposes
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { brandId, jobType } = triggerSchema.parse(body);

    // Verify brand exists
    const [brand] = await db
      .select()
      .from(brands)
      .where(eq(brands.id, brandId))
      .limit(1);

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Create job record
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      brand_id: brandId,
      type: jobType,
      status: 'queued',
      payload: {},
    });

    // Enqueue to Redis via Upstash
    try {
      await enqueueJob({
        jobId,
        type: jobType,
        payload: { brand_id: brandId },
      });
    } catch (queueError) {
      console.error('Failed to enqueue job:', queueError);
      return NextResponse.json(
        { error: 'Job created but failed to queue', jobId, status: 'created_not_queued' },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      jobType,
      brandId,
      message: `Job ${jobType} queued for brand ${brand.name}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('Job trigger error:', error);
    return NextResponse.json({ error: 'Failed to trigger job' }, { status: 500 });
  }
}

/**
 * GET /api/jobs/trigger
 * List available job types
 */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    availableJobTypes: [
      { type: 'gsc_daily_digest', description: 'GSC Daily Digest - Analyze search console data' },
      { type: 'trend_scan_industry', description: 'Trend Scan - Check industry trends' },
      { type: 'metric_snapshot', description: 'Metric Snapshot - Capture current metrics' },
      { type: 'evaluation_scorer', description: 'Evaluation Scorer - Score recommendations' },
      { type: 'strategic_prioritizer', description: 'Strategic Prioritizer - Prioritize recommendations' },
      { type: 'content_optimizer', description: 'Content Optimizer - Generate content suggestions' },
      { type: 'ads_performance_digest', description: 'Ads Performance - Analyze ad campaigns' },
      { type: 'analytics_insights', description: 'Analytics Insights - Analyze GA4 data' },
      { type: 'cross_channel_correlator', description: 'Cross-Channel - Find correlations' },
      { type: 'brand_profiler', description: 'Brand Profiler - Auto-detect brand profile from website' },
    ],
  });
}
