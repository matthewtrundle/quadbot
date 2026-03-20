import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbookTemplates, playbookInstalls } from '@quadbot/db';
import { eq, sql, and } from 'drizzle-orm';
import { getSession, type UserWithBrand } from '@/lib/auth-session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;

    const [template] = await db
      .select({
        id: playbookTemplates.id,
        slug: playbookTemplates.slug,
        name: playbookTemplates.name,
        description: playbookTemplates.description,
        category: playbookTemplates.category,
        vertical: playbookTemplates.vertical,
        trigger_type: playbookTemplates.trigger_type,
        trigger_conditions: playbookTemplates.trigger_conditions,
        actions: playbookTemplates.actions,
        tags: playbookTemplates.tags,
        author_brand_id: playbookTemplates.author_brand_id,
        author_name: playbookTemplates.author_name,
        is_official: playbookTemplates.is_official,
        install_count: playbookTemplates.install_count,
        rating_sum: playbookTemplates.rating_sum,
        rating_count: playbookTemplates.rating_count,
        version: playbookTemplates.version,
        created_at: playbookTemplates.created_at,
        updated_at: playbookTemplates.updated_at,
        avgRating:
          sql<number>`CASE WHEN ${playbookTemplates.rating_count} > 0 THEN ROUND(${playbookTemplates.rating_sum}::numeric / ${playbookTemplates.rating_count}, 2) ELSE 0 END`.as(
            'avg_rating',
          ),
      })
      .from(playbookTemplates)
      .where(eq(playbookTemplates.slug, slug))
      .limit(1);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check if the current user's brand has installed this template
    const userBrandId = (session.user as UserWithBrand).brandId;
    let isInstalled = false;

    if (userBrandId) {
      const [install] = await db
        .select({ id: playbookInstalls.id })
        .from(playbookInstalls)
        .where(and(eq(playbookInstalls.template_id, template.id), eq(playbookInstalls.brand_id, userBrandId)))
        .limit(1);

      isInstalled = !!install;
    }

    return NextResponse.json({ ...template, isInstalled });
  } catch (error) {
    console.error('Error fetching marketplace template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
