import { db } from '@/lib/db';
import { outreachConversations, leads, campaigns } from '@quadbot/db';
import { eq, desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let conversations: {
    conversation: typeof outreachConversations.$inferSelect;
    lead: typeof leads.$inferSelect;
    campaign: typeof campaigns.$inferSelect;
  }[] = [];
  let totalCount = 0;
  let error = false;

  try {
    const [rows, countResult] = await Promise.all([
      db
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
        .limit(PAGE_SIZE)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(outreachConversations)
        .where(eq(outreachConversations.brand_id, id)),
    ]);
    conversations = rows;
    totalCount = countResult[0]?.count ?? 0;
  } catch (err) {
    console.error('Conversations query failed:', err);
    error = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p>Failed to load conversations. Please try refreshing.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount} conversation{totalCount !== 1 ? 's' : ''}
        </p>
        {totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        )}
      </div>

      {conversations.length === 0 && !error ? (
        <p className="text-center text-muted-foreground py-8">
          No conversations yet. Replies to your outreach emails will appear here.
        </p>
      ) : (
        <div className="grid gap-3">
          {conversations.map(({ conversation: c, lead, campaign }) => (
            <Link key={c.id} href={`/brands/${id}/outreach/conversations/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lead.email} &middot; {campaign.name}
                      </p>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          {page > 1 && (
            <Link
              href={`/brands/${id}/outreach/conversations?page=${page - 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
            >
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/brands/${id}/outreach/conversations?page=${page + 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
