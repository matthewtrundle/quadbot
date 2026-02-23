import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, outreachEmails, campaignLeads, outreachConversations } from '@quadbot/db';
import { eq, sql, and, gte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get('brandId');
  const campaignId = url.searchParams.get('campaignId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const emailConditions = campaignId
    ? and(eq(outreachEmails.brand_id, brandId), eq(outreachEmails.campaign_id, campaignId))
    : eq(outreachEmails.brand_id, brandId);

  const emailStats = await db
    .select({
      total_sent: sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
      bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
      complained: sql<number>`count(*) filter (where ${outreachEmails.status} = 'complained')`,
      total_opens: sql<number>`coalesce(sum(${outreachEmails.open_count}), 0)`,
      total_clicks: sql<number>`coalesce(sum(${outreachEmails.click_count}), 0)`,
    })
    .from(outreachEmails)
    .where(emailConditions);

  const leadConditions = campaignId
    ? eq(campaignLeads.campaign_id, campaignId)
    : sql`${campaignLeads.campaign_id} IN (SELECT id FROM campaigns WHERE brand_id = ${brandId})`;

  const leadStats = await db
    .select({
      total: sql<number>`count(*)`,
      replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
      completed: sql<number>`count(*) filter (where ${campaignLeads.status} = 'completed')`,
    })
    .from(campaignLeads)
    .where(leadConditions);

  const conversationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(outreachConversations)
    .where(eq(outreachConversations.brand_id, brandId));

  const s = emailStats[0];
  const l = leadStats[0];

  return NextResponse.json({
    emails: {
      ...s,
      delivery_rate: s.total_sent > 0 ? s.delivered / s.total_sent : 0,
      open_rate: s.delivered > 0 ? s.opened / s.delivered : 0,
      click_rate: s.delivered > 0 ? s.clicked / s.delivered : 0,
      bounce_rate: s.total_sent > 0 ? s.bounced / s.total_sent : 0,
    },
    leads: l,
    conversations: conversationCount[0].count,
  });
}
