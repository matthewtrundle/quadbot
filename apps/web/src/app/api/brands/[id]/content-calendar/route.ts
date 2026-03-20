import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { artifacts, actionDrafts, campaigns } from '@quadbot/db';
import { eq, and, gte, lte, desc, inArray, or, isNotNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type CalendarEvent = {
  id: string;
  title: string;
  type: 'content' | 'brief' | 'publish_action' | 'campaign' | 'scheduled';
  status: string;
  date: string;
  scheduledFor?: string;
};

/**
 * Calculate the calendar grid boundaries for a given month.
 * Returns the Monday before (or on) the 1st and the Sunday after (or on) the last day.
 */
function getMonthBoundaries(monthStr: string): { startDate: Date; endDate: Date; month: string } {
  // monthStr format: "2026-03"
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthNumStr, 10) - 1; // 0-based

  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));

  // Monday before or on the 1st (Monday = 1, Sunday = 0)
  const firstDow = firstOfMonth.getUTCDay();
  // Convert so Monday=0, Sunday=6
  const daysToMonday = firstDow === 0 ? 6 : firstDow - 1;
  const startDate = new Date(firstOfMonth);
  startDate.setUTCDate(startDate.getUTCDate() - daysToMonday);

  // Sunday after or on the last day
  const lastDow = lastOfMonth.getUTCDay();
  const daysToSunday = lastDow === 0 ? 0 : 7 - lastDow;
  const endDate = new Date(lastOfMonth);
  endDate.setUTCDate(endDate.getUTCDate() + daysToSunday);

  // Set endDate to end of day
  endDate.setUTCHours(23, 59, 59, 999);

  return { startDate, endDate, month: monthStr };
}

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get('month') || getCurrentMonth();

  const { startDate, endDate } = getMonthBoundaries(month);

  const [artifactRows, actionRows, campaignRows] = await Promise.all([
    db
      .select({
        id: artifacts.id,
        title: artifacts.title,
        type: artifacts.type,
        status: artifacts.status,
        created_at: artifacts.created_at,
        scheduled_publish_at: artifacts.scheduled_publish_at,
      })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.brand_id, brandId),
          or(
            // Artifacts created within the date range
            and(gte(artifacts.created_at, startDate), lte(artifacts.created_at, endDate)),
            // Artifacts scheduled within the date range
            and(
              isNotNull(artifacts.scheduled_publish_at),
              gte(artifacts.scheduled_publish_at, startDate),
              lte(artifacts.scheduled_publish_at, endDate),
            ),
          ),
        ),
      )
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
        and(
          eq(actionDrafts.brand_id, brandId),
          inArray(actionDrafts.type, ['content-publisher', 'github-publish']),
          gte(actionDrafts.created_at, startDate),
          lte(actionDrafts.created_at, endDate),
        ),
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
      .where(
        and(eq(campaigns.brand_id, brandId), gte(campaigns.created_at, startDate), lte(campaigns.created_at, endDate)),
      )
      .orderBy(desc(campaigns.created_at)),
  ]);

  const calendarEvents: CalendarEvent[] = [];
  const seenIds = new Set<string>();

  for (const a of artifactRows) {
    // If the artifact has a scheduled_publish_at and is still a draft, show as 'scheduled'
    if (a.scheduled_publish_at && a.status === 'draft') {
      const scheduledDate = a.scheduled_publish_at.toISOString();
      calendarEvents.push({
        id: a.id,
        title: a.title,
        type: 'scheduled',
        status: a.status,
        date: scheduledDate,
        scheduledFor: scheduledDate,
      });
      seenIds.add(a.id);
    }

    // Also show as content/brief if created_at falls within range (and not already added as same id)
    if (a.created_at >= startDate && a.created_at <= endDate && !seenIds.has(a.id)) {
      calendarEvents.push({
        id: a.id,
        title: a.title,
        type: a.type === 'trend_content_brief' ? 'brief' : 'content',
        status: a.status,
        date: a.created_at.toISOString(),
        scheduledFor: a.scheduled_publish_at?.toISOString(),
      });
      seenIds.add(a.id);
    } else if (a.created_at >= startDate && a.created_at <= endDate && seenIds.has(a.id)) {
      // Already added as scheduled — also add the creation event
      calendarEvents.push({
        id: `${a.id}-created`,
        title: a.title,
        type: a.type === 'trend_content_brief' ? 'brief' : 'content',
        status: a.status,
        date: a.created_at.toISOString(),
        scheduledFor: a.scheduled_publish_at?.toISOString(),
      });
    }
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

  return NextResponse.json({
    events: calendarEvents,
    month,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}
