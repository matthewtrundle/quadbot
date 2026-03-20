import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbookTemplates, playbooks, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth-session';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { playbookId, brandId, description, category, vertical, tags } = body;

    if (!playbookId || !brandId || !description || !category) {
      return NextResponse.json(
        { error: 'playbookId, brandId, description, and category are required' },
        { status: 400 },
      );
    }

    // Fetch the playbook
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, playbookId)).limit(1);

    if (!playbook) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 });
    }

    if (playbook.brand_id !== brandId) {
      return NextResponse.json({ error: 'Playbook does not belong to this brand' }, { status: 403 });
    }

    // Fetch the brand for author_name
    const [brand] = await db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.id, brandId))
      .limit(1);

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const slug = generateSlug(playbook.name);

    const [template] = await db
      .insert(playbookTemplates)
      .values({
        slug,
        name: playbook.name,
        description,
        category,
        vertical: vertical || null,
        trigger_type: playbook.trigger_type,
        trigger_conditions: playbook.trigger_conditions,
        actions: playbook.actions,
        tags: tags || [],
        author_brand_id: brandId,
        author_name: brand.name,
        is_official: false,
        install_count: 0,
        rating_sum: 0,
        rating_count: 0,
        is_published: true,
        version: 1,
      })
      .returning();

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error publishing marketplace template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
