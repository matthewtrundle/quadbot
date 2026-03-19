'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

type EventEntry = {
  type: string;
  description: string;
  payload_example: Record<string, unknown>;
};

type WebhookFormat = {
  description: string;
  headers: Record<string, string>;
  verification: string;
};

type EventCatalogResponse = {
  events: EventEntry[];
  webhook_format: WebhookFormat;
};

const CATEGORY_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }
> = {
  recommendation: { label: 'Recommendations', variant: 'default' },
  action_draft: { label: 'Action Drafts', variant: 'warning' },
  action: { label: 'Actions', variant: 'success' },
  outcome: { label: 'Outcomes', variant: 'secondary' },
  report: { label: 'Reports', variant: 'outline' },
  signal: { label: 'Signals', variant: 'destructive' },
};

function getCategoryKey(eventType: string): string {
  // action_draft.created -> action_draft, action.executed -> action
  const dotIndex = eventType.indexOf('.');
  return dotIndex !== -1 ? eventType.substring(0, dotIndex) : eventType;
}

function groupByCategory(events: EventEntry[]): Record<string, EventEntry[]> {
  const groups: Record<string, EventEntry[]> = {};
  for (const event of events) {
    const key = getCategoryKey(event.type);
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }
  return groups;
}

function EventCard({ event }: { event: EventEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(event.payload_example, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <Card className="transition-colors hover:border-primary/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <code className="rounded bg-secondary px-2 py-1 text-xs font-semibold text-foreground">{event.type}</code>
        </div>
        <span className="ml-4 text-sm text-muted-foreground">{event.description}</span>
      </button>
      {expanded && (
        <CardContent className="border-t border-border/50 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payload Example</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-secondary/50 p-4 text-xs leading-relaxed text-foreground dark:bg-secondary/30">
            <code>{jsonString}</code>
          </pre>
        </CardContent>
      )}
    </Card>
  );
}

export function EventCatalog() {
  const [catalog, setCatalog] = useState<EventCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCatalog() {
      try {
        const res = await fetch('/api/webhooks/events');
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();
        setCatalog(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event catalog');
      } finally {
        setLoading(false);
      }
    }
    fetchCatalog();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary/50" />
        ))}
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error || 'Failed to load event catalog'}
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByCategory(catalog.events);
  const totalCount = catalog.events.length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Available Events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount} event types available for webhook subscriptions
          </p>
        </div>
        <Badge variant="outline">{totalCount} events</Badge>
      </div>

      {Object.entries(grouped).map(([categoryKey, events]) => {
        const category = CATEGORY_MAP[categoryKey] || {
          label: categoryKey,
          variant: 'outline' as const,
        };
        return (
          <div key={categoryKey} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={category.variant}>{category.label}</Badge>
              <span className="text-xs text-muted-foreground">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {events.map((event) => (
                <EventCard key={event.type} event={event} />
              ))}
            </div>
          </div>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Webhook Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{catalog.webhook_format.description}</p>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Headers</span>
            <div className="mt-2 space-y-2">
              {Object.entries(catalog.webhook_format.headers).map(([header, desc]) => (
                <div key={header} className="flex gap-3 text-sm">
                  <code className="shrink-0 rounded bg-secondary px-2 py-0.5 text-xs font-semibold">{header}</code>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Signature Verification
            </span>
            <p className="mt-1 text-sm text-muted-foreground">{catalog.webhook_format.verification}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
