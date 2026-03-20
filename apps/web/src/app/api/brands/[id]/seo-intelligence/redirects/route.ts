import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  // Fetch redirect recommendations
  const recs = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.brand_id, brandId), eq(recommendations.source, 'auto_redirect_manager')))
    .orderBy(desc(recommendations.created_at))
    .limit(50);

  const redirects = recs.map((rec) => {
    const data = (rec.data ?? {}) as Record<string, unknown>;
    return {
      id: rec.id,
      source_url: (data.source_url as string) ?? '',
      target_url: (data.target_url as string) ?? '',
      confidence: (data.confidence as string) ?? 'medium',
      reason: (data.reason as string) ?? rec.body,
      status: rec.status,
    };
  });

  return NextResponse.json({ redirects });
}
