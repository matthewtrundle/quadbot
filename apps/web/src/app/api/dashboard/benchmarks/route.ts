import { NextRequest, NextResponse } from 'next/server';
import { getSession, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { metricSnapshots } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brandId = (session.user as UserWithBrand).brandId ?? null;
  if (!brandId) {
    return NextResponse.json({ benchmarks: [], pagespeed: [] });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [benchmarks, pagespeed] = await Promise.all([
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          eq(metricSnapshots.source, 'benchmark'),
          gte(metricSnapshots.captured_at, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at)),
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          eq(metricSnapshots.source, 'pagespeed'),
          gte(metricSnapshots.captured_at, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at)),
  ]);

  return NextResponse.json({ benchmarks, pagespeed });
}
