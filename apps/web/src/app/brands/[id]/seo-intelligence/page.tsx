'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VolatilityPoint {
  date: string;
  volatility: number;
  aboveThreshold: boolean;
}

interface AlgorithmAlert {
  id: string;
  title: string;
  body: string;
  created_at: string;
  confidence: number | null;
  data: {
    analysis?: string;
    affected_page_types?: string[];
    recovery_recommendations?: string[];
    detected_at?: string;
    [key: string]: unknown;
  };
}

interface AlgorithmData {
  volatilityData: VolatilityPoint[];
  alerts: AlgorithmAlert[];
  alertThreshold: number;
}

interface QueryOpportunity {
  query: string;
  current_position: number;
  impressions: number;
  ctr: number;
  potential_gain: number;
  type: 'optimize_position' | 'improve_ctr' | 'new_content';
  recommendation: string;
}

interface NegativeKeyword {
  query: string;
  reason: string;
  wasted_clicks: number;
}

interface QueryCluster {
  theme: string;
  queries: string[];
  total_impressions: number;
  content_suggestion: string;
}

interface QueryData {
  opportunities: QueryOpportunity[];
  negativeKeywords: NegativeKeyword[];
  clusters: QueryCluster[];
  summary: {
    opportunitiesFound: number;
    negativeKeywordsFound: number;
    clustersFound: number;
  };
}

interface RedirectSuggestion {
  id: string;
  source_url: string;
  target_url: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  status: string;
}

interface RedirectData {
  redirects: RedirectSuggestion[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function opportunityTypeBadge(type: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (type) {
    case 'new_content':
      return 'default';
    case 'improve_ctr':
      return 'secondary';
    case 'optimize_position':
      return 'outline';
    default:
      return 'outline';
  }
}

function confidenceBadge(confidence: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (confidence) {
    case 'high':
      return 'default';
    case 'medium':
      return 'secondary';
    case 'low':
      return 'outline';
    default:
      return 'outline';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SEOIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [activeTab, setActiveTab] = useState('algorithm');

  // Algorithm state
  const [algorithmData, setAlgorithmData] = useState<AlgorithmData | null>(null);
  const [algorithmLoading, setAlgorithmLoading] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);

  // Query state
  const [queryData, setQueryData] = useState<QueryData | null>(null);
  const [queryLoading, setQueryLoading] = useState(true);
  const [miningQueries, setMiningQueries] = useState(false);

  // Redirect state
  const [redirectData, setRedirectData] = useState<RedirectData | null>(null);
  const [redirectLoading, setRedirectLoading] = useState(true);
  const [scanning404s, setScanning404s] = useState(false);

  // ─── Fetch Functions ──────────────────────────────────────────────────────

  const fetchAlgorithmData = useCallback(async () => {
    setAlgorithmLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/seo-intelligence/algorithm`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: AlgorithmData = await res.json();
      setAlgorithmData(json);
    } catch {
      // silently fail
    } finally {
      setAlgorithmLoading(false);
    }
  }, [brandId]);

  const fetchQueryData = useCallback(async () => {
    setQueryLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/seo-intelligence/queries`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: QueryData = await res.json();
      setQueryData(json);
    } catch {
      // silently fail
    } finally {
      setQueryLoading(false);
    }
  }, [brandId]);

  const fetchRedirectData = useCallback(async () => {
    setRedirectLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/seo-intelligence/redirects`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: RedirectData = await res.json();
      setRedirectData(json);
    } catch {
      // silently fail
    } finally {
      setRedirectLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchAlgorithmData();
    fetchQueryData();
    fetchRedirectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // ─── Action Handlers ──────────────────────────────────────────────────────

  const handleRunDetection = useCallback(async () => {
    setRunningDetection(true);
    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'algorithm_update_detector', brandId }),
      });
      if (!res.ok) throw new Error('Failed to trigger');
      setTimeout(() => fetchAlgorithmData(), 2000);
    } catch {
      // silently fail
    } finally {
      setRunningDetection(false);
    }
  }, [brandId, fetchAlgorithmData]);

  const handleMineQueries = useCallback(async () => {
    setMiningQueries(true);
    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'search_query_miner', brandId }),
      });
      if (!res.ok) throw new Error('Failed to trigger');
      setTimeout(() => fetchQueryData(), 2000);
    } catch {
      // silently fail
    } finally {
      setMiningQueries(false);
    }
  }, [brandId, fetchQueryData]);

  const handleScan404s = useCallback(async () => {
    setScanning404s(true);
    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'auto_redirect_manager', brandId }),
      });
      if (!res.ok) throw new Error('Failed to trigger');
      setTimeout(() => fetchRedirectData(), 2000);
    } catch {
      // silently fail
    } finally {
      setScanning404s(false);
    }
  }, [brandId, fetchRedirectData]);

  // ─── Expanded cluster state ───────────────────────────────────────────────

  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  const toggleCluster = (index: number) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  const LoadingSkeleton = ({ message }: { message: string }) => (
    <Card>
      <CardContent className="py-20">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">{message}</span>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Algorithm Tab ─────────────────────────────────────────────────────────

  const alertThreshold = algorithmData?.alertThreshold ?? 0;
  const volatilityData = algorithmData?.volatilityData ?? [];
  const alerts = algorithmData?.alerts ?? [];

  const renderAlgorithmTab = () => {
    if (algorithmLoading) return <LoadingSkeleton message="Loading algorithm data..." />;

    return (
      <div className="space-y-6">
        {/* Volatility Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Rank Volatility (14 Days)</CardTitle>
                <CardDescription>Daily search rank volatility across tracked keywords</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleRunDetection} disabled={runningDetection}>
                {runningDetection && (
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                Run Detection
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {volatilityData.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                <p className="font-medium text-sm">No volatility data available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Run detection to start monitoring algorithm changes.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={volatilityData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  {alertThreshold > 0 && (
                    <ReferenceLine
                      y={alertThreshold}
                      stroke="#ef4444"
                      strokeDasharray="6 3"
                      label={{ value: 'Alert Threshold', position: 'right', fontSize: 11, fill: '#ef4444' }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="volatility"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: VolatilityPoint };
                      return (
                        <circle
                          key={`dot-${payload.date}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={payload.aboveThreshold ? '#ef4444' : 'hsl(var(--primary))'}
                          stroke={payload.aboveThreshold ? '#ef4444' : 'hsl(var(--primary))'}
                        />
                      );
                    }}
                    name="Volatility"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Algorithm Update Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Algorithm Update Alerts</h3>
            {alerts.map((alert) => (
              <Card key={alert.id} className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="destructive">Potential Algorithm Update Detected</Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime((alert.data?.detected_at as string) || alert.created_at)}
                    </span>
                    {alert.confidence != null && (
                      <Badge variant="outline">{Math.round(alert.confidence * 100)}% confidence</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base">{alert.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {alert.data?.analysis && (
                    <div>
                      <p className="text-sm font-medium mb-1">AI Analysis</p>
                      <p className="text-sm text-muted-foreground">{alert.data.analysis as string}</p>
                    </div>
                  )}

                  {alert.data?.affected_page_types && (alert.data.affected_page_types as string[]).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Affected Page Types</p>
                      <div className="flex gap-2 flex-wrap">
                        {(alert.data.affected_page_types as string[]).map((pt) => (
                          <Badge key={pt} variant="secondary">
                            {pt}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {alert.data?.recovery_recommendations &&
                    (alert.data.recovery_recommendations as string[]).length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Recovery Recommendations</p>
                        <ul className="list-disc list-inside space-y-1">
                          {(alert.data.recovery_recommendations as string[]).map((rec, i) => (
                            <li key={i} className="text-sm text-muted-foreground">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {alerts.length === 0 && !algorithmLoading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium text-sm">No algorithm updates detected</p>
            <p className="text-sm text-muted-foreground mt-1">
              The system is monitoring for significant ranking changes that may indicate algorithm updates.
            </p>
          </div>
        )}
      </div>
    );
  };

  // ─── Query Mining Tab ──────────────────────────────────────────────────────

  const opportunities = queryData?.opportunities ?? [];
  const negativeKeywords = queryData?.negativeKeywords ?? [];
  const clusters = queryData?.clusters ?? [];
  const querySummary = queryData?.summary ?? { opportunitiesFound: 0, negativeKeywordsFound: 0, clustersFound: 0 };

  const renderQueryTab = () => {
    if (queryLoading) return <LoadingSkeleton message="Loading query data..." />;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={handleMineQueries} disabled={miningQueries}>
            {miningQueries && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            Mine Queries
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Opportunities Found</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{querySummary.opportunitiesFound}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Negative Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{querySummary.negativeKeywordsFound}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Query Clusters</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{querySummary.clustersFound}</p>
            </CardContent>
          </Card>
        </div>

        {/* Opportunities Table */}
        <Card>
          <CardHeader>
            <CardTitle>Opportunities</CardTitle>
            <CardDescription>Search queries with ranking improvement potential</CardDescription>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <p className="font-medium text-sm">No opportunities found</p>
                <p className="text-sm text-muted-foreground mt-1">Run query mining to discover opportunities.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Query</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Position</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Impressions</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">CTR</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Potential Gain</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Type</th>
                      <th className="pb-2 font-medium text-muted-foreground">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((opp, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{opp.query}</td>
                        <td className="py-3 pr-4">{opp.current_position.toFixed(1)}</td>
                        <td className="py-3 pr-4">{opp.impressions.toLocaleString()}</td>
                        <td className="py-3 pr-4">{(opp.ctr * 100).toFixed(1)}%</td>
                        <td className="py-3 pr-4 text-green-600">+{opp.potential_gain.toLocaleString()}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={opportunityTypeBadge(opp.type)}>{opp.type.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">{opp.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Negative Keywords */}
        <Card>
          <CardHeader>
            <CardTitle>Negative Keywords</CardTitle>
            <CardDescription>Queries driving irrelevant traffic to your site</CardDescription>
          </CardHeader>
          <CardContent>
            {negativeKeywords.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <p className="font-medium text-sm">No negative keywords found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Negative keywords will appear here after query mining.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {negativeKeywords.map((nk, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <span className="font-medium text-sm">{nk.query}</span>
                      <p className="text-sm text-muted-foreground">{nk.reason}</p>
                      <span className="text-xs text-red-600">
                        Est. wasted clicks: {nk.wasted_clicks.toLocaleString()}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" disabled>
                      Add to Negative List
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Query Clusters */}
        <Card>
          <CardHeader>
            <CardTitle>Query Clusters</CardTitle>
            <CardDescription>Related queries grouped by theme for content planning</CardDescription>
          </CardHeader>
          <CardContent>
            {clusters.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <p className="font-medium text-sm">No clusters found</p>
                <p className="text-sm text-muted-foreground mt-1">Clusters will appear here after query mining.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clusters.map((cluster, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <button
                      onClick={() => toggleCluster(i)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{cluster.theme}</span>
                        <Badge variant="secondary">{cluster.queries.length} queries</Badge>
                        <span className="text-sm text-muted-foreground">
                          {cluster.total_impressions.toLocaleString()} impressions
                        </span>
                      </div>
                      <span className="text-muted-foreground text-sm">{expandedClusters.has(i) ? '−' : '+'}</span>
                    </button>
                    {expandedClusters.has(i) && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                          {cluster.queries.map((q, qi) => (
                            <Badge key={qi} variant="outline">
                              {q}
                            </Badge>
                          ))}
                        </div>
                        <div className="rounded bg-muted/50 p-3">
                          <p className="text-sm font-medium mb-1">Content Suggestion</p>
                          <p className="text-sm text-muted-foreground">{cluster.content_suggestion}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── Redirect Tab ──────────────────────────────────────────────────────────

  const redirects = redirectData?.redirects ?? [];

  const renderRedirectTab = () => {
    if (redirectLoading) return <LoadingSkeleton message="Loading redirect data..." />;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={handleScan404s} disabled={scanning404s}>
            {scanning404s && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            Scan for 404s
          </Button>
        </div>

        {redirects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="font-medium text-sm">No redirect suggestions</p>
            <p className="text-sm text-muted-foreground mt-1">
              Scan for 404 errors to discover redirect opportunities.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {redirects.map((redirect) => (
              <Card key={redirect.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      {/* URL mapping */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="destructive">404</Badge>
                          <span className="font-mono text-sm truncate">{redirect.source_url}</span>
                        </div>
                        <span className="text-muted-foreground font-bold shrink-0">&rarr;</span>
                        <span className="font-mono text-sm text-green-600 truncate">{redirect.target_url}</span>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3">
                        <Badge variant={confidenceBadge(redirect.confidence)}>{redirect.confidence} confidence</Badge>
                      </div>

                      {/* Reason */}
                      <p className="text-sm text-muted-foreground">{redirect.reason}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="default" disabled>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">SEO Intelligence Hub</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="algorithm">Algorithm Monitor</TabsTrigger>
          <TabsTrigger value="queries">Query Mining</TabsTrigger>
          <TabsTrigger value="redirects">Redirect Manager</TabsTrigger>
        </TabsList>

        <TabsContent value="algorithm" className="mt-4">
          {renderAlgorithmTab()}
        </TabsContent>

        <TabsContent value="queries" className="mt-4">
          {renderQueryTab()}
        </TabsContent>

        <TabsContent value="redirects" className="mt-4">
          {renderRedirectTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
