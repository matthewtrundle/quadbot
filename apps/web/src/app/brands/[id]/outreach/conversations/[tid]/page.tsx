import { db } from '@/lib/db';
import { outreachConversations, outreachMessages, leads, campaigns } from '@quadbot/db';
import { eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApproveRejectButtons } from '@/components/outreach/approve-reject-buttons';
import { ConversationReply } from '@/components/outreach/conversation-reply';

export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const { id: brandId, tid } = await params;

  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, tid))
    .limit(1);
  if (!conversation) notFound();

  const [lead] = await db.select().from(leads).where(eq(leads.id, conversation.lead_id)).limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, conversation.campaign_id)).limit(1);

  const messages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.conversation_id, tid))
    .orderBy(asc(outreachMessages.created_at));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{lead?.first_name} {lead?.last_name}</h3>
          <p className="text-sm text-muted-foreground">{lead?.email} &middot; {lead?.company} &middot; {campaign?.name}</p>
        </div>
        <Badge variant={conversation.status === 'active' ? 'default' : 'secondary'}>
          {conversation.status}
        </Badge>
      </div>

      <div className="space-y-3">
        {messages.map((msg) => (
          <Card key={msg.id} className={msg.direction === 'outbound' ? 'border-l-4 border-l-primary' : 'border-l-4 border-l-green-500'}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{msg.direction === 'outbound' ? 'You' : lead?.email}</span>
                  {msg.ai_generated && (
                    <Badge variant="outline" className="text-xs">AI</Badge>
                  )}
                  {msg.ai_generated && msg.ai_approved === null && (
                    <Badge variant="destructive" className="text-xs">Pending Approval</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              {msg.subject && <p className="text-sm font-medium mb-1">{msg.subject}</p>}
              <div className="text-sm whitespace-pre-wrap">{msg.body_text || 'No text content'}</div>

              {msg.ai_generated && msg.ai_approved === null && (
                <div className="flex gap-2 mt-3">
                  <ApproveRejectButtons conversationId={tid} messageId={msg.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ConversationReply conversationId={tid} />
    </div>
  );
}
