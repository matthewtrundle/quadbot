import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { jobs } from '@quadbot/db';
import { JobType } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';
import { randomUUID } from 'node:crypto';

type InboundEmailHeader = { name: string; value: string };

type InboundEmailEvent = {
  data: {
    from: string;
    to: string;
    subject?: string;
    text?: string;
    html?: string;
    email_id?: string;
    headers?: InboundEmailHeader[];
  };
};

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const MAX_BODY_SIZE = 1_000_000; // 1MB limit for email bodies

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const svixId = req.headers.get('svix-id') || '';
  const svixTimestamp = req.headers.get('svix-timestamp') || '';
  const svixSignature = req.headers.get('svix-signature') || '';

  let event: InboundEmailEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as InboundEmailEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const data = event.data;
  if (!data?.from || !data?.to) {
    return NextResponse.json({ ok: true });
  }

  // Extract headers for reply matching
  const headers: InboundEmailHeader[] = data.headers || [];
  const inReplyTo = headers.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value;
  const references = headers.find((h) => h.name.toLowerCase() === 'references')?.value;

  // Create a job for async processing (brand will be determined by reply matching)
  const jobId = randomUUID();
  const jobPayload = {
    from_email: data.from,
    to_email: data.to,
    subject: data.subject || '',
    body_text: (data.text || '').slice(0, 50_000), // Truncate excessively long bodies
    body_html: (data.html || '').slice(0, 100_000),
    in_reply_to: inReplyTo || null,
    references: references || null,
    resend_inbound_id: data.email_id || null,
    raw_headers: Object.fromEntries(headers.map((h) => [h.name, h.value])),
  };

  try {
    // We need a brand_id to create the job - use a system-level approach
    // The process-reply handler will determine brand from email matching
    await db.insert(jobs).values({
      id: jobId,
      brand_id: null as unknown as string, // Resolved by the handler via email matching
      type: JobType.OUTREACH_PROCESS_REPLY,
      status: 'queued',
      payload: jobPayload,
    });

    await enqueueJob({
      jobId,
      type: JobType.OUTREACH_PROCESS_REPLY,
      payload: { brand_id: 'system', ...jobPayload },
    });
  } catch (err) {
    console.error('[webhook/resend/inbound] Failed to create job:', err);
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
