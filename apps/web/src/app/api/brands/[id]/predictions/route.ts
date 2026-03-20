import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { predictions } from '@quadbot/db';
import { eq, and, desc, lte } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const { searchParams } = new URL(req.url);
  const metricKey = searchParams.get('metric_key');
  const days = parseInt(searchParams.get('days') ?? '30', 10);
  const source = searchParams.get('source');

  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const conditions = [eq(predictions.brand_id, brandId), lte(predictions.prediction_date, futureDate)];

  if (metricKey) {
    conditions.push(eq(predictions.metric_key, metricKey));
  }
  if (source) {
    conditions.push(eq(predictions.source, source));
  }

  const results = await db
    .select()
    .from(predictions)
    .where(and(...conditions))
    .orderBy(desc(predictions.prediction_date));

  return NextResponse.json(results);
}
