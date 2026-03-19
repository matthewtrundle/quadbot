'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Delivery = {
  id: string;
  event_type: string;
  success: boolean;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function DeliveryLog({ brandId }: { brandId: string }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDeliveries = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      try {
        const res = await fetch(`/api/brands/${brandId}/integrations/deliveries`);
        if (res.ok) {
          const data = await res.json();
          setDeliveries(data);
        }
      } catch {
        if (showRefresh) toast.error('Failed to load deliveries');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [brandId],
  );

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(() => fetchDeliveries(), 30000);
    return () => clearInterval(interval);
  }, [fetchDeliveries]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Deliveries</CardTitle>
            <CardDescription>Last 20 webhook delivery attempts</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchDeliveries(true)} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium">Event Type</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(d.created_at)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">
                        {d.event_type}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {d.success ? (
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <span className="flex items-center gap-1">
                          <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                          {d.error && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-[120px]">
                              {d.error}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {d.duration_ms != null ? `${d.duration_ms}ms` : '-'}
                    </td>
                    <td className="py-2 text-xs">
                      {d.status_code != null ? (
                        <Badge
                          variant={d.status_code >= 200 && d.status_code < 300 ? 'default' : 'destructive'}
                          className="text-[10px]"
                        >
                          {d.status_code}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
