import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { anomalyAlerts } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId, aid: alertId } = await params;

  const [updated] = await db
    .update(anomalyAlerts)
    .set({
      is_acknowledged: true,
      acknowledged_at: new Date(),
    })
    .where(and(eq(anomalyAlerts.id, alertId), eq(anomalyAlerts.brand_id, brandId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Anomaly alert not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
