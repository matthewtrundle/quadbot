import { db } from '@/lib/db';
import { campaigns } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
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

export default async function OutreachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const allCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.brand_id, id))
    .orderBy(desc(campaigns.created_at));

  return (
    <div className="space-y-4">
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
          {allCampaigns.map((c) => (
            <Link key={c.id} href={`/brands/${id}/outreach/campaigns/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <Badge variant={statusColors[c.status] || 'secondary'}>{c.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6 text-sm text-muted-foreground">
                    <span>{c.total_leads || 0} leads</span>
                    <span>{c.total_sent || 0} sent</span>
                    <span>Mode: {c.reply_mode}</span>
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{c.description}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
