import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { artifacts, actionDrafts, campaigns } from '@quadbot/db';
import { eq, and, gte, desc, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type CalendarEvent = {
  id: string;
  title: string;
  type: 'content' | 'brief' | 'publish_action' | 'campaign';
  status: string;
  date: string;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [artifactRows, actionRows, campaignRows] = await Promise.all([
    db
      .select({
        id: artifacts.id,
        title: artifacts.title,
        type: artifacts.type,
        status: artifacts.status,
        created_at: artifacts.created_at,
      })
      .from(artifacts)
      .where(and(eq(artifacts.brand_id, brandId), gte(artifacts.created_at, thirtyDaysAgo)))
      .orderBy(desc(artifacts.created_at)),

    db
      .select({
        id: actionDrafts.id,
        type: actionDrafts.type,
        status: actionDrafts.status,
        payload: actionDrafts.payload,
        created_at: actionDrafts.created_at,
      })
      .from(actionDrafts)
      .where(
        and(eq(actionDrafts.brand_id, brandId), inArray(actionDrafts.type, ['content-publisher', 'github-publish'])),
      )
      .orderBy(desc(actionDrafts.created_at)),

    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        created_at: campaigns.created_at,
      })
      .from(campaigns)
      .where(eq(campaigns.brand_id, brandId))
      .orderBy(desc(campaigns.created_at)),
  ]);

  const calendarEvents: CalendarEvent[] = [];

  for (const a of artifactRows) {
    calendarEvents.push({
      id: a.id,
      title: a.title,
      type: a.type === 'trend_content_brief' ? 'brief' : 'content',
      status: a.status,
      date: a.created_at.toISOString(),
    });
  }

  for (const ad of actionRows) {
    const payload = ad.payload as Record<string, unknown>;
    calendarEvents.push({
      id: ad.id,
      title: (payload?.title as string) || `${ad.type} action`,
      type: 'publish_action',
      status: ad.status,
      date: ad.created_at.toISOString(),
    });
  }

  for (const c of campaignRows) {
    calendarEvents.push({
      id: c.id,
      title: c.name,
      type: 'campaign',
      status: c.status,
      date: c.created_at.toISOString(),
    });
  }

  calendarEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(calendarEvents);
}
