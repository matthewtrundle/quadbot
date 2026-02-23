import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachConversations, leads, campaigns } from '@quadbot/db';
import { eq, sql, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const rows = await db
    .select({
      conversation: outreachConversations,
      lead: leads,
      campaign: campaigns,
    })
    .from(outreachConversations)
    .innerJoin(leads, eq(outreachConversations.lead_id, leads.id))
    .innerJoin(campaigns, eq(outreachConversations.campaign_id, campaigns.id))
    .where(eq(outreachConversations.brand_id, brandId))
    .orderBy(desc(outreachConversations.last_message_at))
    .limit(100);

  return NextResponse.json(
    rows.map((r) => ({
      ...r.conversation,
      lead: { id: r.lead.id, email: r.lead.email, first_name: r.lead.first_name, last_name: r.lead.last_name, company: r.lead.company },
      campaign: { id: r.campaign.id, name: r.campaign.name },
    })),
  );
}
