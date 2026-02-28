import { db } from '@/lib/db';
import { campaigns, outreachEmails, outreachConversations } from '@quadbot/db';
import { eq, desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  paused: 'outline',
  completed: 'secondary',
  archived: 'secondary',
};

const dotColors: Record<string, string> = {
  active: 'bg-green-500',
  draft: 'bg-gray-400',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-400',
};

function statusDot(status: string) {
  const color = dotColors[status] || 'bg-gray-400';
  return <span className={`w-2 h-2 rounded-full inline-block ${color}`} />;
}

function daysAgo(date: Date | null): string {
  if (!date) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Created today';
  if (diffDays === 1) return 'Created 1 day ago';
  return `Created ${diffDays} days ago`;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default async function OutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const allCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.brand_id, id))
    .orderBy(desc(campaigns.created_at));

  // Aggregate open counts per campaign from outreach_emails
  const openStats = await db
    .select({
      campaign_id: outreachEmails.campaign_id,
      total_opens: sql<number>`count(*) filter (where ${outreachEmails.opened_at} is not null)`.as(
        'total_opens'
      ),
    })
    .from(outreachEmails)
    .where(eq(outreachEmails.brand_id, id))
    .groupBy(outreachEmails.campaign_id);

  // Aggregate reply counts per campaign from outreach_conversations
  const replyStats = await db
    .select({
      campaign_id: outreachConversations.campaign_id,
      total_replies: sql<number>`count(*)`.as('total_replies'),
    })
    .from(outreachConversations)
    .where(eq(outreachConversations.brand_id, id))
    .groupBy(outreachConversations.campaign_id);

  const opensMap = new Map(openStats.map((o) => [o.campaign_id, Number(o.total_opens)]));
  const repliesMap = new Map(replyStats.map((r) => [r.campaign_id, Number(r.total_replies)]));

  // Summary stats
  const totalCampaigns = allCampaigns.length;
  const activeCampaigns = allCampaigns.filter((c) => c.status === 'active').length;
  const totalLeads = allCampaigns.reduce((sum, c) => sum + (c.total_leads || 0), 0);
  const totalSent = allCampaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Campaigns</p>
          <p className="text-2xl font-semibold">{totalCampaigns}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-semibold text-green-600">{activeCampaigns}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Leads</p>
          <p className="text-2xl font-semibold">{totalLeads}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Sent</p>
          <p className="text-2xl font-semibold">{totalSent}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{allCampaigns.length} campaigns</p>
        <Link href={`/brands/${id}/outreach/campaigns/new`}>
          <Button size="sm">New Campaign</Button>
        </Link>
      </div>

      {allCampaigns.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No campaigns yet. Create your first campaign to start outreach.
        </p>
      ) : (
        <div className="grid gap-4">
          {allCampaigns.map((c) => {
            const opens = opensMap.get(c.id) || 0;
            const replies = repliesMap.get(c.id) || 0;
            const sent = c.total_sent || 0;
            const leads = c.total_leads || 0;
            const sentRatio = leads > 0 ? Math.min((sent / leads) * 100, 100) : 0;

            return (
              <Link key={c.id} href={`/brands/${id}/outreach/campaigns/${c.id}`}>
                <Card className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <Badge variant={statusColors[c.status] || 'secondary'} className="gap-1.5">
                        {statusDot(c.status)}
                        {c.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      <span>{leads} leads</span>
                      <span>{sent} sent</span>
                      <span>Open rate: {pct(opens, sent)}</span>
                      <span>Reply rate: {pct(replies, sent)}</span>
                      <span>Mode: {c.reply_mode}</span>
                    </div>

                    {/* Progress bar: sent / leads */}
                    {leads > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Send progress</span>
                          <span>{pct(sent, leads)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${sentRatio}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {c.description && (
                      <p className="text-sm text-muted-foreground truncate">{c.description}</p>
                    )}

                    <p className="text-xs text-muted-foreground">{daysAgo(c.created_at)}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
