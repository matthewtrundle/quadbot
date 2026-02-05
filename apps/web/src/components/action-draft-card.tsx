'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ActionDraft = {
  id: string;
  type: string;
  risk: string;
  status: string;
  requires_approval: boolean;
  payload: Record<string, unknown>;
  created_at: Date;
};

const riskColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
  executed_stub: 'secondary',
};

export function ActionDraftCard({ draft }: { draft: ActionDraft }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(true);
    try {
      await fetch(`/api/actions/${draft.id}/${action}`, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{draft.type}</CardTitle>
          <div className="flex gap-2">
            <Badge variant={riskColors[draft.risk] || 'outline'}>Risk: {draft.risk}</Badge>
            <Badge variant={statusColors[draft.status] || 'outline'}>{draft.status}</Badge>
          </div>
        </div>
        <CardDescription>{new Date(draft.created_at).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
          {JSON.stringify(draft.payload, null, 2)}
        </pre>
      </CardContent>
      {draft.status === 'pending' && (
        <CardFooter className="gap-2">
          <Button size="sm" onClick={() => handleAction('approve')} disabled={loading}>
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleAction('reject')} disabled={loading}>
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
