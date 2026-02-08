import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { signals } from '@quadbot/db';
import { desc, gte } from 'drizzle-orm';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const recentSignals = await db
    .select()
    .from(signals)
    .where(gte(signals.expires_at, new Date()))
    .orderBy(desc(signals.created_at))
    .limit(10);

  return NextResponse.json(recentSignals);
}
