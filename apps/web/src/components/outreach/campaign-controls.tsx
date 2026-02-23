'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function CampaignControls({
  campaignId,
  status,
  brandId,
}: {
  campaignId: string;
  status: string;
  brandId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const action = async (endpoint: string) => {
    setLoading(true);
    await fetch(`/api/outreach/campaigns/${campaignId}/${endpoint}`, { method: 'POST' });
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex gap-2">
      {(status === 'draft' || status === 'paused') && (
        <Button size="sm" onClick={() => action('start')} disabled={loading}>
          {status === 'draft' ? 'Start' : 'Resume'}
        </Button>
      )}
      {status === 'active' && (
        <>
          <Button size="sm" variant="outline" onClick={() => action('pause')} disabled={loading}>
            Pause
          </Button>
          <Button size="sm" variant="destructive" onClick={() => action('stop')} disabled={loading}>
            Stop
          </Button>
        </>
      )}
    </div>
  );
}
