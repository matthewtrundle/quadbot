import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps, campaignLeads, outreachEmails } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignControls } from '@/components/outreach/campaign-controls';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id: brandId, cid } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, cid)).limit(1);
  if (!campaign) notFound();

  let ls = { total: 0, pending: 0, scheduled: 0, sent: 0, replied: 0, completed: 0, bounced: 0 };
  let es = { total: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
  let steps: (typeof campaignSequenceSteps.$inferSelect)[] = [];
  let error = false;

  try {
    const [stepsResult, leadStats, emailStats] = await Promise.all([
      db
        .select()
        .from(campaignSequenceSteps)
        .where(eq(campaignSequenceSteps.campaign_id, cid))
        .orderBy(campaignSequenceSteps.step_order),
      db
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
        .where(eq(campaignLeads.campaign_id, cid)),
      db
        .select({
          total: sql<number>`count(*)`,
          delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
          opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
          clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
          bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
        })
        .from(outreachEmails)
        .where(eq(outreachEmails.campaign_id, cid)),
    ]);
    steps = stepsResult;
    ls = leadStats[0] ?? ls;
    es = emailStats[0] ?? es;
  } catch (err) {
    console.error('Campaign detail query failed:', err);
    error = true;
  }

  const statusOptions = ['draft', 'paused', 'active', 'completed', 'archived'] as const;
  const typedStatus = statusOptions.includes(campaign.status as (typeof statusOptions)[number])
    ? (campaign.status as (typeof statusOptions)[number])
    : 'draft';

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p>Failed to load some campaign data. Please try refreshing.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{campaign.name}</h3>
          {campaign.description && <p className="text-sm text-muted-foreground">{campaign.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>{campaign.status}</Badge>
          <CampaignControls campaignId={cid} status={typedStatus} brandId={brandId} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <p className="text-2xl font-bold">{pct(es.opened, es.total)}</p>
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
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <span>
              Pending: <strong>{ls.pending}</strong>
            </span>
            <span>
              Scheduled: <strong>{ls.scheduled}</strong>
            </span>
            <span>
              Sent: <strong>{ls.sent}</strong>
            </span>
            <span>
              Replied: <strong>{ls.replied}</strong>
            </span>
            <span>
              Completed: <strong>{ls.completed}</strong>
            </span>
            <span>
              Bounced: <strong>{ls.bounced}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sequence Steps ({steps.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-border/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">Step {step.step_order}</span>
                {step.delay_days > 0 && <span className="text-xs text-muted-foreground">+{step.delay_days} days</span>}
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
