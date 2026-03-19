'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ApproveRejectButtons({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (action: 'approve' | 'reject') => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/conversations/${conversationId}/messages/${messageId}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      router.refresh();
    } catch {
      setError(`Failed to ${action}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => handle('approve')} disabled={loading}>
          Approve & Send
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={loading}>
              Reject
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject this message?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reject the outreach message draft. You can generate a new draft afterward.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handle('reject')}
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
