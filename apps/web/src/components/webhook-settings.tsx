'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Webhook = {
  id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
};

const AVAILABLE_EVENTS = [
  'recommendation.created',
  'action_draft.created',
  'action_draft.approved',
  'action_draft.rejected',
  'action.executed',
  'outcome.collected',
];

export function WebhookSettings({ brandId }: { brandId: string }) {
  const [webhooksList, setWebhooksList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchWebhooks();
  }, [brandId]);

  async function fetchWebhooks() {
    try {
      const res = await fetch(`/api/webhooks/outgoing?brand_id=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setWebhooksList(data);
      }
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }

  async function createWebhook() {
    if (!newUrl) return;
    setCreating(true);
    setNewSecret(null);
    try {
      const res = await fetch('/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          url: newUrl,
          event_types: selectedEvents.length > 0 ? selectedEvents : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewSecret(data.secret);
        setNewUrl('');
        setSelectedEvents([]);
        fetchWebhooks();
        toast.success('Webhook created');
      } else {
        toast.error('Failed to create webhook');
      }
    } catch {
      toast.error('Failed to create webhook');
    } finally {
      setCreating(false);
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Remove this webhook? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/webhooks/outgoing?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWebhooksList((prev) => prev.filter((wh) => wh.id !== id));
        toast.success('Webhook removed');
      } else {
        toast.error('Failed to remove webhook');
      }
    } catch {
      toast.error('Failed to remove webhook');
    }
  }

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outgoing Webhooks</CardTitle>
        <CardDescription>
          Receive HTTP POST notifications when events happen. Leave event types empty to receive all events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing webhooks */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : webhooksList.length > 0 ? (
          <div className="space-y-2">
            {webhooksList.map((wh) => (
              <div key={wh.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs truncate block max-w-[300px]">{wh.url}</code>
                    <Badge variant={wh.is_active ? 'default' : 'destructive'} className="text-[10px]">
                      {wh.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    {wh.failure_count > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {wh.failure_count} failures
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {(wh.event_types as string[]).length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">All events</span>
                    ) : (
                      (wh.event_types as string[]).map((e) => (
                        <Badge key={e} variant="outline" className="text-[9px]">
                          {e}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteWebhook(wh.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No webhooks configured.</p>
        )}

        {/* Secret display (shown once after creation) */}
        {newSecret && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
            <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              Signing secret (shown once, save it now):
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all flex-1">{newSecret}</code>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(newSecret);
                  setCopied(true);
                  toast.success('Secret copied to clipboard');
                  setTimeout(() => setCopied(false), 2000);
                }}
                aria-label="Copy secret to clipboard"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        {/* Add new webhook */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/webhook"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="text-sm"
            />
            <Button onClick={createWebhook} disabled={creating || !newUrl} size="sm">
              Add
            </Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {AVAILABLE_EVENTS.map((event) => (
              <Badge
                key={event}
                variant={selectedEvents.includes(event) ? 'default' : 'outline'}
                className="text-[10px] cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => toggleEvent(event)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEvent(event); } }}
                aria-pressed={selectedEvents.includes(event)}
              >
                {event}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
