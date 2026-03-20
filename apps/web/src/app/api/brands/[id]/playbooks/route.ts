import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbooks } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: brandId } = await params;
    const userBrandId = (session.user as UserWithBrand).brandId;
    const admin = isAdmin(session);
    if (!admin && userBrandId !== brandId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allPlaybooks = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.brand_id, brandId))
      .orderBy(desc(playbooks.created_at));

    return NextResponse.json(allPlaybooks);
  } catch (error) {
    console.error('Error listing brand playbooks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: brandId } = await params;
    const userBrandId = (session.user as UserWithBrand).brandId;
    const admin = isAdmin(session);
    if (!admin && userBrandId !== brandId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name, trigger_type, trigger_conditions, actions } = body;

    if (!name || !trigger_type || !trigger_conditions || !actions) {
      return NextResponse.json(
        { error: 'name, trigger_type, trigger_conditions, and actions are required' },
        { status: 400 },
      );
    }

    const [newPlaybook] = await db
      .insert(playbooks)
      .values({
        brand_id: brandId,
        name,
        trigger_type,
        trigger_conditions,
        actions,
        is_active: true,
      })
      .returning();

    return NextResponse.json(newPlaybook, { status: 201 });
  } catch (error) {
    console.error('Error creating playbook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
