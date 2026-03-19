'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Webhook, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConnectServiceCard } from '@/components/integrations/connect-service-card';
import { DeliveryLog } from '@/components/integrations/delivery-log';

type Integration = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  created_at: string;
};

type WebhookItem = {
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

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const masked = u.pathname.length > 16 ? u.pathname.slice(0, 10) + '...' + u.pathname.slice(-4) : u.pathname;
    return u.origin + masked;
  } catch {
    return url.slice(0, 24) + '...';
  }
}

function relativeTime(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function IntegrationHub({
  brandId,
  integrations: initialIntegrations,
  webhooks: initialWebhooks,
}: {
  brandId: string;
  integrations: Integration[];
  webhooks: WebhookItem[];
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [webhooksList, setWebhooksList] = useState(initialWebhooks);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refreshIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/integrations`);
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data);
      }
    } catch {
      // silent
    }
  }, [brandId]);

  const refreshWebhooks = useCallback(async () => {
    try {
      const res = await fetch(`/api/webhooks/outgoing?brand_id=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setWebhooksList(data);
      }
    } catch {
      // silent
    }
  }, [brandId]);

  const slackIntegration = integrations.find((i) => i.type === 'slack_webhook');
  const discordIntegration = integrations.find((i) => i.type === 'discord_webhook');

  async function createWebhook() {
    if (!newUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          url: newUrl.trim(),
          event_types: selectedEvents.length > 0 ? selectedEvents : undefined,
        }),
      });
      if (res.ok) {
        setNewUrl('');
        setSelectedEvents([]);
        refreshWebhooks();
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
        setWebhooksList((prev) => prev.filter((w) => w.id !== id));
        toast.success('Webhook removed');
      } else {
        toast.error('Failed to remove webhook');
      }
    } catch {
      toast.error('Failed to remove webhook');
    }
  }

  async function testWebhook(id: string) {
    setTestingId(id);
    try {
      const res = await fetch(`/api/brands/${brandId}/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_id: id }),
      });
      if (res.ok) {
        toast.success('Test webhook sent');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Test failed');
      }
    } catch {
      toast.error('Test failed');
    } finally {
      setTestingId(null);
    }
  }

  function toggleEvent(event: string) {
    setSelectedEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Connected Services */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Connected Services</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ConnectServiceCard
            brandId={brandId}
            type="slack_webhook"
            integration={slackIntegration ? { id: slackIntegration.id, config: slackIntegration.config } : undefined}
            onUpdate={refreshIntegrations}
          />
          <ConnectServiceCard
            brandId={brandId}
            type="discord_webhook"
            integration={
              discordIntegration ? { id: discordIntegration.id, config: discordIntegration.config } : undefined
            }
            onUpdate={refreshIntegrations}
          />
          {/* Custom Webhook card — links to section below */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Webhook className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Custom Webhook</CardTitle>
                </div>
                <Badge variant={webhooksList.length > 0 ? 'default' : 'secondary'} className="text-xs">
                  {webhooksList.length > 0 ? `${webhooksList.length} configured` : 'Not configured'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Send HTTP POST notifications to any endpoint when events occur.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  document.getElementById('outgoing-webhooks')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Manage below
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: Outgoing Webhooks */}
      <div id="outgoing-webhooks" className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outgoing Webhooks</CardTitle>
            <CardDescription>
              Receive HTTP POST notifications when events happen. Leave event types empty to receive all events.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing webhooks */}
            {webhooksList.length > 0 ? (
              <div className="space-y-2">
                {webhooksList.map((wh) => (
                  <div key={wh.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs truncate block max-w-[300px]">{maskUrl(wh.url)}</code>
                        <Badge variant={wh.is_active ? 'default' : 'destructive'} className="text-[10px]">
                          {wh.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                        {wh.failure_count > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {wh.failure_count} failures
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 flex-wrap">
                          {wh.event_types.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">All events</span>
                          ) : (
                            wh.event_types.map((e) => (
                              <Badge key={e} variant="outline" className="text-[9px]">
                                {e}
                              </Badge>
                            ))
                          )}
                        </div>
                        {wh.last_triggered_at && (
                          <span className="text-[10px] text-muted-foreground">
                            Last triggered {relativeTime(wh.last_triggered_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testWebhook(wh.id)}
                        disabled={testingId === wh.id}
                      >
                        {testingId === wh.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhook(wh.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No webhooks configured.</p>
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
                <Button onClick={createWebhook} disabled={creating || !newUrl.trim()} size="sm">
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Add Webhook
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleEvent(event);
                      }
                    }}
                    aria-pressed={selectedEvents.includes(event)}
                  >
                    {event}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Recent Deliveries */}
      <DeliveryLog brandId={brandId} />
    </div>
  );
}
