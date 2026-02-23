'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ConversationReply({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    await fetch(`/api/outreach/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body_text: body }),
    });
    setBody('');
    setSending(false);
    router.refresh();
  };

  const handleAiDraft = async () => {
    setSending(true);
    await fetch(`/api/outreach/conversations/${conversationId}/ai-draft`, {
      method: 'POST',
    });
    setSending(false);
    router.refresh();
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your reply..."
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={handleAiDraft} disabled={sending}>
          AI Draft
        </Button>
        <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? 'Sending...' : 'Send Reply'}
        </Button>
      </div>
    </div>
  );
}
