import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs } from '@quadbot/db';
import { JobType } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';
import { authenticateRequest } from '@/lib/auth-api-keys';
import { emitEvent } from '@/lib/events';
import { EventType } from '@quadbot/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const webhookSchema = z.object({
  brand_id: z.string().uuid(),
  post_content: z.string().min(1),
  post_author: z.string().optional(),
  post_context: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Auth: require valid API key
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = webhookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify brand access
  if (auth.role === 'brand' && auth.brandId !== parsed.data.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const jobId = randomUUID();

  await db.insert(jobs).values({
    id: jobId,
    brand_id: parsed.data.brand_id,
    type: JobType.COMMUNITY_MODERATE_POST,
    status: 'queued',
    payload: parsed.data,
  });

  await enqueueJob({
    jobId,
    type: JobType.COMMUNITY_MODERATE_POST,
    payload: {
      brand_id: parsed.data.brand_id,
      post_content: parsed.data.post_content,
      post_author: parsed.data.post_author || 'Unknown',
      post_context: parsed.data.post_context || '',
    },
  });

  // Emit webhook.received event
  await emitEvent(
    EventType.WEBHOOK_RECEIVED,
    parsed.data.brand_id,
    { job_id: jobId, post_content: parsed.data.post_content },
    `webhook:${jobId}:${Date.now()}`,
  );

  return NextResponse.json({ jobId, status: 'queued' }, { status: 201 });
}
