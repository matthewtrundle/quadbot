import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps, campaignLeads, outreachEmails, leads } from '@quadbot/db';
import { eq, desc, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignControls } from '@/components/outreach/campaign-controls';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id: brandId, cid } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, cid)).limit(1);
  if (!campaign) notFound();

  const steps = await db
    .select()
    .from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, cid))
    .orderBy(campaignSequenceSteps.step_order);

  const leadStats = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where ${campaignLeads.status} = 'pending')`,
      scheduled: sql<number>`count(*) filter (where ${campaignLeads.status} = 'scheduled')`,
      sent: sql<number>`count(*) filter (where ${campaignLeads.status} = 'sent')`,
      replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
      completed: sql<number>`count(*) filter (where ${campaignLeads.status} = 'completed')`,
      bounced: sql<number>`count(*) filter (where ${campaignLeads.status} = 'bounced')`,
    })
    .from(campaignLeads)
    .where(eq(campaignLeads.campaign_id, cid));

  const emailStats = await db
    .select({
      total: sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
      bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
    })
    .from(outreachEmails)
    .where(eq(outreachEmails.campaign_id, cid));

  const ls = leadStats[0];
  const es = emailStats[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{campaign.name}</h3>
          {campaign.description && (
            <p className="text-sm text-muted-foreground">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
            {campaign.status}
          </Badge>
          <CampaignControls campaignId={cid} status={campaign.status} brandId={brandId} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{ls.total}</p>
            <p className="text-xs text-muted-foreground">Total Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{es.total}</p>
            <p className="text-xs text-muted-foreground">Emails Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{es.total > 0 ? Math.round((es.opened / es.total) * 100) : 0}%</p>
            <p className="text-xs text-muted-foreground">Open Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{ls.replied}</p>
            <p className="text-xs text-muted-foreground">Replies</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm">
            <span>Pending: {ls.pending}</span>
            <span>Scheduled: {ls.scheduled}</span>
            <span>Sent: {ls.sent}</span>
            <span>Replied: {ls.replied}</span>
            <span>Completed: {ls.completed}</span>
            <span>Bounced: {ls.bounced}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sequence Steps ({steps.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="border rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">Step {step.step_order}</span>
                {step.delay_days > 0 && (
                  <span className="text-xs text-muted-foreground">+{step.delay_days} days</span>
                )}
              </div>
              <p className="text-sm font-medium">{step.subject_template}</p>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{step.body_template}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
