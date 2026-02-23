import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type EvidenceItem = { metric: string; value: string; context?: string };
type NextStep = { action: string; details?: string; effort?: 'minutes' | 'hours' | 'days' };
type TopChange = { query: string; clicks_delta?: number; impressions_delta?: number; ctr_delta?: number; position_delta?: number };
type TopCampaign = { campaign_name: string; spend?: number; conversions?: number; roas?: number; trend?: string };
type TopPage = { page_path: string; pageviews?: number; avg_time_on_page?: number; exit_rate?: number };
type KeyMetrics = { sessions?: number; users?: number; bounce_rate?: number; avg_session_duration?: number; conversions?: number };
type Correlation = { channel_a: string; channel_b: string; correlation_type: string; insight: string; confidence?: number };

interface EnrichedData {
  impact_summary?: string | null;
  evidence?: EvidenceItem[] | null;
  next_steps?: NextStep[] | null;
  affected_queries?: string[] | null;
  affected_pages?: string[] | null;
  affected_campaigns?: string[] | null;
  affected_channels?: string[] | null;
  top_changes?: TopChange[] | null;
  top_campaigns?: TopCampaign[] | null;
  top_pages?: TopPage[] | null;
  key_metrics?: KeyMetrics | null;
  correlations?: Correlation[] | null;
}

const effortColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  minutes: 'secondary',
  hours: 'default',
  days: 'outline',
};

function formatNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function formatDelta(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${formatNumber(n)}`;
}

function deltaColor(n: number | undefined | null, invertPositive = false): string {
  if (n == null || n === 0) return 'text-muted-foreground';
  const isGood = invertPositive ? n < 0 : n > 0;
  return isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
}

export function EnrichedDataSection({ data }: { data: Record<string, unknown> }) {
  const d = data as EnrichedData;

  const hasContent =
    d.impact_summary ||
    (d.evidence && d.evidence.length > 0) ||
    (d.next_steps && d.next_steps.length > 0) ||
    (d.affected_queries && d.affected_queries.length > 0) ||
    (d.affected_pages && d.affected_pages.length > 0) ||
    (d.affected_campaigns && d.affected_campaigns.length > 0) ||
    (d.affected_channels && d.affected_channels.length > 0) ||
    (d.top_changes && d.top_changes.length > 0) ||
    (d.top_campaigns && d.top_campaigns.length > 0) ||
    (d.top_pages && d.top_pages.length > 0) ||
    d.key_metrics ||
    (d.correlations && d.correlations.length > 0);

  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {/* Impact Summary */}
      {d.impact_summary && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{d.impact_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Evidence */}
      {d.evidence && d.evidence.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.evidence.map((e, i) => (
                <div key={i} className="rounded-md border border-border/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{e.metric}</p>
                  <p className="text-lg font-bold tabular-nums">{e.value}</p>
                  {e.context && <p className="text-xs text-muted-foreground mt-1">{e.context}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {d.next_steps && d.next_steps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {d.next_steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{step.action}</p>
                      {step.effort && (
                        <Badge variant={effortColors[step.effort] || 'outline'} className="text-[11px] shrink-0">
                          {step.effort}
                        </Badge>
                      )}
                    </div>
                    {step.details && <p className="text-xs text-muted-foreground mt-0.5">{step.details}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Affected Items */}
      {(d.affected_queries?.length || d.affected_pages?.length || d.affected_campaigns?.length || d.affected_channels?.length) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Affected Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.affected_queries && d.affected_queries.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Queries</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.affected_queries.map((q, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-mono">{q}</Badge>
                  ))}
                </div>
              </div>
            )}
            {d.affected_pages && d.affected_pages.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Pages</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.affected_pages.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-mono truncate max-w-xs">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {d.affected_campaigns && d.affected_campaigns.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Campaigns</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.affected_campaigns.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {d.affected_channels && d.affected_channels.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Channels</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.affected_channels.map((ch, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{ch}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Changes (GSC) */}
      {d.top_changes && d.top_changes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Top Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th scope="col" className="pb-2 pr-4 font-medium">Query</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Clicks</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Impressions</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">CTR</th>
                    <th scope="col" className="pb-2 font-medium text-right">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_changes.map((c, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{c.query}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${deltaColor(c.clicks_delta)}`}>{formatDelta(c.clicks_delta)}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${deltaColor(c.impressions_delta)}`}>{formatDelta(c.impressions_delta)}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${deltaColor(c.ctr_delta)}`}>
                        {c.ctr_delta != null ? `${formatDelta(c.ctr_delta * 100)}%` : '—'}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${deltaColor(c.position_delta, true)}`}>{formatDelta(c.position_delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Campaigns (Ads) */}
      {d.top_campaigns && d.top_campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Top Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th scope="col" className="pb-2 pr-4 font-medium">Campaign</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Spend</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Conversions</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">ROAS</th>
                    <th scope="col" className="pb-2 font-medium text-right">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_campaigns.map((c, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-4 text-xs">{c.campaign_name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{c.spend != null ? `$${formatNumber(c.spend)}` : '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(c.conversions)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{c.roas != null ? `${c.roas.toFixed(1)}x` : '—'}</td>
                      <td className="py-2 text-right">
                        {c.trend && (
                          <Badge variant={c.trend === 'up' ? 'default' : c.trend === 'down' ? 'destructive' : 'secondary'} className="text-[11px]">
                            {c.trend}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics (Analytics) */}
      {d.key_metrics && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {d.key_metrics.sessions != null && (
                <div className="rounded-md border border-border/50 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                  <p className="text-lg font-bold tabular-nums">{formatNumber(d.key_metrics.sessions)}</p>
                </div>
              )}
              {d.key_metrics.users != null && (
                <div className="rounded-md border border-border/50 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Users</p>
                  <p className="text-lg font-bold tabular-nums">{formatNumber(d.key_metrics.users)}</p>
                </div>
              )}
              {d.key_metrics.bounce_rate != null && (
                <div className="rounded-md border border-border/50 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bounce Rate</p>
                  <p className="text-lg font-bold tabular-nums">{(d.key_metrics.bounce_rate * 100).toFixed(1)}%</p>
                </div>
              )}
              {d.key_metrics.avg_session_duration != null && (
                <div className="rounded-md border border-border/50 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Duration</p>
                  <p className="text-lg font-bold tabular-nums">{Math.round(d.key_metrics.avg_session_duration)}s</p>
                </div>
              )}
              {d.key_metrics.conversions != null && (
                <div className="rounded-md border border-border/50 p-3 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Conversions</p>
                  <p className="text-lg font-bold tabular-nums">{formatNumber(d.key_metrics.conversions)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Pages (Analytics) */}
      {d.top_pages && d.top_pages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Top Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th scope="col" className="pb-2 pr-4 font-medium">Page</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Pageviews</th>
                    <th scope="col" className="pb-2 pr-4 font-medium text-right">Avg Time</th>
                    <th scope="col" className="pb-2 font-medium text-right">Exit Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_pages.map((p, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs truncate max-w-[200px]">{p.page_path}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(p.pageviews)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{p.avg_time_on_page != null ? `${Math.round(p.avg_time_on_page)}s` : '—'}</td>
                      <td className="py-2 text-right tabular-nums">{p.exit_rate != null ? `${(p.exit_rate * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correlations (Cross-Channel) */}
      {d.correlations && d.correlations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cross-Channel Correlations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.correlations.map((c, i) => (
              <div key={i} className="rounded-md border border-border/50 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="secondary" className="text-[11px]">{c.channel_a}</Badge>
                  <span className="text-xs text-muted-foreground">&harr;</span>
                  <Badge variant="secondary" className="text-[11px]">{c.channel_b}</Badge>
                  <Badge
                    variant={c.correlation_type === 'positive' ? 'default' : c.correlation_type === 'negative' ? 'destructive' : 'outline'}
                    className="text-[11px]"
                  >
                    {c.correlation_type}
                  </Badge>
                  {c.confidence != null && (
                    <span className="text-[11px] text-muted-foreground ml-auto">{(c.confidence * 100).toFixed(0)}% confidence</span>
                  )}
                </div>
                <p className="text-sm">{c.insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
