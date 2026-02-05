import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs } from '@quadbot/db';
import { jobCreateSchema } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';
import { authenticateRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { randomUUID } from 'node:crypto';

export async function POST(req: NextRequest) {
  // Auth: require valid API key
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = jobCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify brand access
  if (auth.role === 'brand' && auth.brandId !== parsed.data.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit per brand
  const rateLimit = await checkRateLimit(parsed.data.brand_id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', remaining: rateLimit.remaining, resetAt: rateLimit.resetAt },
      { status: 429 },
    );
  }

  const jobId = randomUUID();

  // Insert job record
  await db.insert(jobs).values({
    id: jobId,
    brand_id: parsed.data.brand_id,
    type: parsed.data.type,
    status: 'queued',
    payload: parsed.data.payload,
  });

  // Enqueue to Redis
  await enqueueJob({
    jobId,
    type: parsed.data.type,
    payload: { brand_id: parsed.data.brand_id, ...parsed.data.payload },
  });

  return NextResponse.json({ jobId, status: 'queued' }, { status: 201 });
}
