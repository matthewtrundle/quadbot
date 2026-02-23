'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ApproveRejectButtons({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handle = async (action: 'approve' | 'reject') => {
    setLoading(true);
    await fetch(`/api/outreach/conversations/${conversationId}/messages/${messageId}/${action}`, {
      method: 'POST',
    });
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => handle('approve')} disabled={loading}>
        Approve & Send
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle('reject')} disabled={loading}>
        Reject
      </Button>
    </div>
  );
}
