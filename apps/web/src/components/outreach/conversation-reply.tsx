'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export function ConversationReply({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/outreach/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: body }),
      });
      if (!res.ok) throw new Error('Failed to send reply');
      setBody('');
      setFeedback({ type: 'success', message: 'Reply sent' });
      router.refresh();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to send reply. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const handleAiDraft = async () => {
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/outreach/conversations/${conversationId}/ai-draft`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to generate draft');
      setFeedback({ type: 'success', message: 'AI draft generated' });
      router.refresh();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to generate AI draft. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          )}
          {feedback.message}
        </div>
      )}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your reply..." rows={3} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={handleAiDraft} disabled={sending}>
          {sending ? 'Drafting...' : 'AI Draft'}
        </Button>
        <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? 'Sending...' : 'Send Reply'}
        </Button>
      </div>
    </div>
  );
}
