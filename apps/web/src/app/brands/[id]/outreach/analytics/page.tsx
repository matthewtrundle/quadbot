import { db } from '@/lib/db';
import { outreachEmails, outreachConversations } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let error = false;
  let e = { total: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
  let convCount = 0;

  try {
    const [emailStats, conversationCount] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
          opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
          clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
          bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
        })
        .from(outreachEmails)
        .where(eq(outreachEmails.brand_id, id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(outreachConversations)
        .where(eq(outreachConversations.brand_id, id)),
    ]);
    e = emailStats[0] ?? e;
    convCount = conversationCount[0]?.count ?? 0;
  } catch (err) {
    console.error('Analytics query failed:', err);
    error = true;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p>Failed to load analytics. Please try refreshing.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
            <p className="text-2xl font-bold">{convCount}</p>
            <p className="text-xs text-muted-foreground">Conversations</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
