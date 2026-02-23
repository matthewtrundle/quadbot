import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { leads } from '@quadbot/db';
import { eq, sql, ilike, and, or } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const search = url.searchParams.get('search');
  const listId = url.searchParams.get('listId');
  const offset = (page - 1) * limit;

  const conditions = [eq(leads.brand_id, brandId)];
  if (listId) conditions.push(eq(leads.lead_list_id, listId));
  if (search) {
    conditions.push(
      or(
        ilike(leads.email, `%${search}%`),
        ilike(leads.first_name, `%${search}%`),
        ilike(leads.last_name, `%${search}%`),
        ilike(leads.company, `%${search}%`),
      )!,
    );
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(and(...conditions));

  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(sql`${leads.created_at} DESC`);

  return NextResponse.json({
    leads: rows,
    total: countResult.count,
    page,
    limit,
    totalPages: Math.ceil(countResult.count / limit),
  });
}
