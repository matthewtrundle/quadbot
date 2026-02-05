import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { brand_id } = body;

  if (!brand_id) {
    return NextResponse.json({ error: 'brand_id is required' }, { status: 400 });
  }

  await db
    .delete(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brand_id),
        eq(brandIntegrations.type, 'google_search_console'),
      ),
    );

  return NextResponse.json({ success: true });
}
