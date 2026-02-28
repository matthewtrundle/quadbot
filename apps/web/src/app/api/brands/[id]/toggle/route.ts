import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/brands/[id]/toggle
 *
 * Toggle a brand's active status
 */
const _POST = async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userBrandId = (session.user as UserWithBrand).brandId ?? null;
    const admin = isAdmin(session);

    const { id } = await params;

    if (!admin && userBrandId && userBrandId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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
};
export const POST = withRateLimit(_POST);
