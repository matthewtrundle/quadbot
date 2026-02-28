'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={loading}>
                Stop
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop this campaign?</AlertDialogTitle>
                <AlertDialogDescription>
                  Stopping a campaign is permanent. No further emails will be sent. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => action('stop')}
                >
                  Stop Campaign
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
