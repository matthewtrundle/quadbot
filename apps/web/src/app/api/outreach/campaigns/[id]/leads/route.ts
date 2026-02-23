import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignLeads, leads, outreachAccounts } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { addLeadsToCampaignSchema } from '@quadbot/shared';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      campaign_lead: campaignLeads,
      lead: leads,
    })
    .from(campaignLeads)
    .innerJoin(leads, eq(campaignLeads.lead_id, leads.id))
    .where(eq(campaignLeads.campaign_id, campaignId))
    .limit(limit)
    .offset(offset)
    .orderBy(sql`${campaignLeads.enrolled_at} DESC`);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaignLeads)
    .where(eq(campaignLeads.campaign_id, campaignId));

  return NextResponse.json({
    items: rows.map((r) => ({ ...r.campaign_lead, lead: r.lead })),
    total: countResult.count,
    page,
    limit,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  const body = await req.json();
  const parsed = addLeadsToCampaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Get available accounts for round-robin assignment
  const accounts = await db
    .select()
    .from(outreachAccounts)
    .where(and(eq(outreachAccounts.brand_id, campaign.brand_id), eq(outreachAccounts.status, 'active')));

  let added = 0;
  let skipped = 0;
  let accountIdx = 0;

  for (const leadId of parsed.data.lead_ids) {
    try {
      await db.insert(campaignLeads).values({
        campaign_id: campaignId,
        lead_id: leadId,
        outreach_account_id: accounts.length > 0 ? accounts[accountIdx % accounts.length].id : null,
        status: campaign.status === 'active' ? 'scheduled' : 'pending',
        next_send_at: campaign.status === 'active' ? new Date() : null,
      });
      added++;
      accountIdx++;
    } catch {
      skipped++; // Likely duplicate
    }
  }

  // Update campaign total_leads
  await db
    .update(campaigns)
    .set({ total_leads: sql`${campaigns.total_leads} + ${added}`, updated_at: new Date() })
    .where(eq(campaigns.id, campaignId));

  return NextResponse.json({ added, skipped }, { status: 201 });
}
