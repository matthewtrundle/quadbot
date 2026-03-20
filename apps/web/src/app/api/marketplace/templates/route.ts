import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbookTemplates } from '@quadbot/db';
import { and, eq, sql, desc, ilike, or } from 'drizzle-orm';
import { getSession } from '@/lib/auth-session';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = req.nextUrl;
    const category = url.searchParams.get('category');
    const vertical = url.searchParams.get('vertical');
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') || 'popular';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(playbookTemplates.is_published, true)];

    if (category) {
      conditions.push(eq(playbookTemplates.category, category));
    }
    if (vertical) {
      conditions.push(eq(playbookTemplates.vertical, vertical));
    }
    if (search) {
      conditions.push(
        or(ilike(playbookTemplates.name, `%${search}%`), ilike(playbookTemplates.description, `%${search}%`))!,
      );
    }

    const whereClause = and(...conditions);

    let orderBy;
    switch (sort) {
      case 'newest':
        orderBy = desc(playbookTemplates.created_at);
        break;
      case 'top_rated':
        orderBy = desc(
          sql`CASE WHEN ${playbookTemplates.rating_count} > 0 THEN ${playbookTemplates.rating_sum}::float / ${playbookTemplates.rating_count} ELSE 0 END`,
        );
        break;
      case 'popular':
      default:
        orderBy = desc(playbookTemplates.install_count);
        break;
    }

    const templates = await db
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
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(playbookTemplates)
      .where(whereClause);

    return NextResponse.json({
      templates,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Error listing marketplace templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
