import { db } from '@/lib/db';
import { outreachEmails, campaignLeads, outreachConversations, campaigns } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const emailStats = await db
    .select({
      total: sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
      bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
    })
    .from(outreachEmails)
    .where(eq(outreachEmails.brand_id, id));

  const conversationCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(outreachConversations)
    .where(eq(outreachConversations.brand_id, id));

  const e = emailStats[0];
  const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '0%';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{e.total}</p>
            <p className="text-xs text-muted-foreground">Total Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{pct(e.delivered, e.total)}</p>
            <p className="text-xs text-muted-foreground">Delivery Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{pct(e.opened, e.delivered)}</p>
            <p className="text-xs text-muted-foreground">Open Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{pct(e.clicked, e.delivered)}</p>
            <p className="text-xs text-muted-foreground">Click Rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{e.bounced}</p>
            <p className="text-xs text-muted-foreground">Bounced ({pct(e.bounced, e.total)})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{e.delivered}</p>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{conversationCount[0].count}</p>
            <p className="text-xs text-muted-foreground">Conversations</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
