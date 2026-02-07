import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';

/**
 * POST /api/brands/[id]/toggle
 *
 * Toggle a brand's active status
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { isActive } = await req.json();

    const [updated] = await db
      .update(brands)
      .set({
        is_active: isActive,
        updated_at: new Date(),
      })
      .where(eq(brands.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      brand: {
        id: updated.id,
        name: updated.name,
        is_active: updated.is_active,
      },
    });
  } catch (error) {
    console.error('Failed to toggle brand:', error);
    return NextResponse.json({ error: 'Failed to toggle brand' }, { status: 500 });
  }
}
