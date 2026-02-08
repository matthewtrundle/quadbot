'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, Bookmark, RotateCcw } from 'lucide-react';

type Props = {
  recId: string;
  currentStatus: string;
  variant: 'inline' | 'full';
};

export function RecommendationActions({ recId, currentStatus, variant }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function setStatus(status: 'active' | 'dismissed' | 'bookmarked') {
    setLoading(status);
    try {
      const res = await fetch(`/api/recommendations/${recId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      const labels: Record<string, string> = {
        dismissed: 'Recommendation dismissed',
        bookmarked: 'Recommendation bookmarked',
        active: 'Recommendation restored',
      };
      toast.success(labels[status]);
      router.refresh();
    } catch {
      toast.error('Failed to update recommendation');
    } finally {
      setLoading(null);
    }
  }

  if (variant === 'inline') {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setStatus('dismissed');
        }}
        disabled={loading !== null}
        className="flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-all hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    );
  }

  // Full variant for detail page
  return (
    <div className="flex items-center gap-2">
      {currentStatus === 'active' && (
        <>
          <button
            onClick={() => setStatus('dismissed')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </button>
          <button
            onClick={() => setStatus('bookmarked')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Bookmark
          </button>
        </>
      )}
      {currentStatus === 'dismissed' && (
        <button
          onClick={() => setStatus('active')}
          disabled={loading !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restore
        </button>
      )}
      {currentStatus === 'bookmarked' && (
        <>
          <button
            onClick={() => setStatus('active')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Unbookmark
          </button>
          <button
            onClick={() => setStatus('dismissed')}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
