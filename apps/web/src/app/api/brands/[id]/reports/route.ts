import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { clientReports } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// GET /api/brands/[id]/reports
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Query reports (without report_data to keep payload small) ---
  const reports = await db
    .select({
      id: clientReports.id,
      brand_id: clientReports.brand_id,
      title: clientReports.title,
      period_start: clientReports.period_start,
      period_end: clientReports.period_end,
      status: clientReports.status,
      executive_summary: clientReports.executive_summary,
      recipient_emails: clientReports.recipient_emails,
      generated_by: clientReports.generated_by,
      sent_at: clientReports.sent_at,
      completed_at: clientReports.completed_at,
      created_at: clientReports.created_at,
    })
    .from(clientReports)
    .where(eq(clientReports.brand_id, brandId))
    .orderBy(desc(clientReports.created_at));

  return NextResponse.json(reports);
}
