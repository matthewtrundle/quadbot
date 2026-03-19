'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, Zap, Check, Trash2, Send, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type IntegrationType = 'slack_webhook' | 'discord_webhook';

type Integration = {
  id: string;
  config: Record<string, unknown>;
};

const SERVICE_META: Record<
  IntegrationType,
  { name: string; icon: typeof MessageSquare; urlPattern: RegExp; urlHint: string; emoji: string }
> = {
  slack_webhook: {
    name: 'Slack',
    icon: MessageSquare,
    urlPattern: /^https:\/\/hooks\.slack\.com\//,
    urlHint: 'https://hooks.slack.com/services/...',
    emoji: '#',
  },
  discord_webhook: {
    name: 'Discord',
    icon: Zap,
    urlPattern: /^https:\/\/discord(app)?\.com\/api\/webhooks\//,
    urlHint: 'https://discord.com/api/webhooks/...',
    emoji: '#',
  },
};

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const masked = path.length > 20 ? path.slice(0, 12) + '...' + path.slice(-6) : path;
    return u.origin + masked;
  } catch {
    return url.slice(0, 20) + '...';
  }
}

export function ConnectServiceCard({
  brandId,
  type,
  integration,
  onUpdate,
}: {
  brandId: string;
  type: IntegrationType;
  integration?: Integration;
  onUpdate: () => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const meta = SERVICE_META[type];
  const Icon = meta.icon;
  const isConnected = !!integration;
  const configUrl = integration?.config?.webhook_url as string | undefined;

  async function handleConnect() {
    if (!webhookUrl.trim()) return;

    if (!meta.urlPattern.test(webhookUrl.trim())) {
      toast.error(`Invalid ${meta.name} webhook URL. Expected format: ${meta.urlHint}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          config: { webhook_url: webhookUrl.trim() },
        }),
      });
      if (res.ok) {
        toast.success(`${meta.name} connected`);
        setWebhookUrl('');
        setShowForm(false);
        onUpdate();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to connect ${meta.name}`);
      }
    } catch {
      toast.error(`Failed to connect ${meta.name}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!integration) return;
    if (!confirm(`Disconnect ${meta.name}? Notifications will stop.`)) return;

    setDisconnecting(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/integrations?id=${integration.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`${meta.name} disconnected`);
        onUpdate();
      } else {
        toast.error(`Failed to disconnect ${meta.name}`);
      }
    } catch {
      toast.error(`Failed to disconnect ${meta.name}`);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleTest() {
    if (!integration) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_id: integration.id }),
      });
      if (res.ok) {
        toast.success(`Test notification sent to ${meta.name}`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Test failed');
      }
    } catch {
      toast.error('Test failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">{meta.name}</CardTitle>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'} className="text-xs">
            {isConnected ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" /> Connected
              </span>
            ) : (
              'Not connected'
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="text-xs text-muted-foreground truncate flex-1">
                {configUrl ? maskUrl(configUrl) : 'Configured'}
              </code>
              {configUrl && (
                <a
                  href={configUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Test
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-destructive hover:text-destructive"
              >
                {disconnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : showForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${type}-url`} className="text-xs">
                Webhook URL
              </Label>
              <Input
                id={`${type}-url`}
                placeholder={meta.urlHint}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {type === 'slack_webhook'
                  ? 'Create an Incoming Webhook in your Slack workspace settings.'
                  : 'Create a Webhook in your Discord server channel settings.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConnect} disabled={saving || !webhookUrl.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setWebhookUrl('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
