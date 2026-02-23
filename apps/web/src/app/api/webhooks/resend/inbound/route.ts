import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { jobs } from '@quadbot/db';
import { JobType } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';
import { randomUUID } from 'node:crypto';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await req.text();
  const svixId = req.headers.get('svix-id') || '';
  const svixTimestamp = req.headers.get('svix-timestamp') || '';
  const svixSignature = req.headers.get('svix-signature') || '';

  let event: any;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as any;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const data = event.data;
  if (!data?.from || !data?.to) {
    return NextResponse.json({ ok: true });
  }

  // Extract headers for reply matching
  const headers = (data.headers || []) as Array<{ name: string; value: string }>;
  const inReplyTo = headers.find((h: any) => h.name.toLowerCase() === 'in-reply-to')?.value;
  const references = headers.find((h: any) => h.name.toLowerCase() === 'references')?.value;

  // Create a job for async processing (brand will be determined by reply matching)
  const jobId = randomUUID();
  const jobPayload = {
    from_email: data.from,
    to_email: data.to,
    subject: data.subject || '',
    body_text: data.text || '',
    body_html: data.html || '',
    in_reply_to: inReplyTo || null,
    references: references || null,
    resend_inbound_id: data.email_id || null,
    raw_headers: Object.fromEntries(headers.map((h: any) => [h.name, h.value])),
  };

  // We need a brand_id to create the job - use a system-level approach
  // The process-reply handler will determine brand from email matching
  await db.insert(jobs).values({
    id: jobId,
    brand_id: null as any, // Will be determined by the handler
    type: JobType.OUTREACH_PROCESS_REPLY,
    status: 'queued',
    payload: jobPayload,
  });

  await enqueueJob({
    jobId,
    type: JobType.OUTREACH_PROCESS_REPLY,
    payload: { brand_id: 'system', ...jobPayload },
  });

  return NextResponse.json({ ok: true });
}
