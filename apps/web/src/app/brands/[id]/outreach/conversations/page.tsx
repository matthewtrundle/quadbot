import { db } from '@/lib/db';
import { outreachConversations, leads, campaigns } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const conversations = await db
    .select({
      conversation: outreachConversations,
      lead: leads,
      campaign: campaigns,
    })
    .from(outreachConversations)
    .innerJoin(leads, eq(outreachConversations.lead_id, leads.id))
    .innerJoin(campaigns, eq(outreachConversations.campaign_id, campaigns.id))
    .where(eq(outreachConversations.brand_id, id))
    .orderBy(desc(outreachConversations.last_message_at))
    .limit(100);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{conversations.length} conversations</p>

      {conversations.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No conversations yet. Replies to your outreach emails will appear here.
        </p>
      ) : (
        <div className="grid gap-3">
          {conversations.map(({ conversation: c, lead, campaign }) => (
            <Link key={c.id} href={`/brands/${id}/outreach/conversations/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lead.first_name} {lead.last_name}</p>
                      <p className="text-sm text-muted-foreground">{lead.email} &middot; {campaign.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.ai_draft_pending && <Badge variant="outline">AI Draft</Badge>}
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
                      <span className="text-xs text-muted-foreground">{c.message_count} msgs</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
