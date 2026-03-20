import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbookTemplates, playbookInstalls } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth-session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { templateId, brandId, rating } = body;

    if (!templateId || !brandId || rating == null) {
      return NextResponse.json({ error: 'templateId, brandId, and rating are required' }, { status: 400 });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 });
    }

    // Check if brand has installed the template
    const [install] = await db
      .select()
      .from(playbookInstalls)
      .where(and(eq(playbookInstalls.template_id, templateId), eq(playbookInstalls.brand_id, brandId)))
      .limit(1);

    if (!install) {
      return NextResponse.json({ error: 'You must install this template before rating it' }, { status: 403 });
    }

    const previousRating = install.rating;

    // Update the install record with the new rating
    await db.update(playbookInstalls).set({ rating }).where(eq(playbookInstalls.id, install.id));

    // Recalculate rating_sum and rating_count on the template
    if (previousRating != null) {
      // Updating an existing rating: adjust sum by the difference
      await db
        .update(playbookTemplates)
        .set({
          rating_sum: sql`${playbookTemplates.rating_sum} + ${rating} - ${previousRating}`,
          updated_at: new Date(),
        })
        .where(eq(playbookTemplates.id, templateId));
    } else {
      // New rating: increment both count and sum
      await db
        .update(playbookTemplates)
        .set({
          rating_sum: sql`${playbookTemplates.rating_sum} + ${rating}`,
          rating_count: sql`${playbookTemplates.rating_count} + 1`,
          updated_at: new Date(),
        })
        .where(eq(playbookTemplates.id, templateId));
    }

    return NextResponse.json({ success: true, rating });
  } catch (error) {
    console.error('Error rating marketplace template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
