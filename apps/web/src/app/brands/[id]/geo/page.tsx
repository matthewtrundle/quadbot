'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeoScore {
  id: string;
  brand_id: string;
  query: string;
  platform: string;
  is_mentioned: boolean;
  is_cited: boolean;
  position: number | null;
  snippet: string | null;
  competitor_mentions: string[];
  checked_at: string;
}

interface PlatformSummary {
  platform: string;
  mentionRate: number;
  citationRate: number;
  avgPosition: number | null;
  count: number;
}

interface CompetitorComparison {
  name: string;
  mentionCount: number;
}

interface GeoData {
  summary: {
    visibilityRate: number;
    citationRate: number;
    avgPosition: number | null;
    totalChecks: number;
  };
  byPlatform: PlatformSummary[];
  recentScores: GeoScore[];
  competitorComparison: CompetitorComparison[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  perplexity: '#8b5cf6',
  chatgpt: '#10b981',
  google_aio: '#3b82f6',
  claude: '#f59e0b',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    perplexity: 'Perplexity',
    chatgpt: 'ChatGPT',
    google_aio: 'Google AIO',
    claude: 'Claude',
  };
  return labels[platform] ?? platform;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GeoVisibilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/geo/visibility`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: GeoData = await res.json();
      setData(json);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const handleRunGeoCheck = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'geo_visibility_tracker', brandId }),
      });
      if (!res.ok) throw new Error('Failed to trigger');
      // Wait a moment then refresh
      setTimeout(() => fetchData(), 2000);
    } catch {
      // silently fail
    } finally {
      setRunning(false);
    }
  }, [brandId, fetchData]);

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">AI Search Visibility</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-20">
            <div className="flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading visibility data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary ?? {
    visibilityRate: 0,
    citationRate: 0,
    avgPosition: null,
    totalChecks: 0,
  };

  const platformData = (data?.byPlatform ?? []).map((p) => ({
    platform: platformLabel(p.platform),
    mentionRate: Math.round(p.mentionRate * 100),
    fill: PLATFORM_COLORS[p.platform] ?? '#6b7280',
  }));

  const competitorData = data?.competitorComparison ?? [];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">AI Search Visibility</h2>
        <Button variant="outline" size="sm" onClick={handleRunGeoCheck} disabled={running}>
          {running && (
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          Run GEO Check
        </Button>
      </div>

      {/* Section A: Summary Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visibility Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.totalChecks > 0 ? `${(summary.visibilityRate * 100).toFixed(1)}%` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">queries where brand appears</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Citation Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.totalChecks > 0 ? `${(summary.citationRate * 100).toFixed(1)}%` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">queries where brand URL is cited</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Position</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.avgPosition != null ? `#${summary.avgPosition.toFixed(1)}` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">when mentioned</p>
          </CardContent>
        </Card>
      </div>

      {/* Section B: Platform Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Comparison</CardTitle>
          <CardDescription>Visibility rates across AI search platforms</CardDescription>
        </CardHeader>
        <CardContent>
          {platformData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No platform data available</p>
              <p className="text-sm text-muted-foreground mt-1">Run a GEO check to see platform comparisons.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="platform" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${value}%`, 'Mention Rate']}
                />
                <Bar dataKey="mentionRate" name="Mention Rate" radius={[4, 4, 0, 0]}>
                  {platformData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section C: Query Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Query Results</CardTitle>
          <CardDescription>Individual query visibility checks</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.recentScores ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No query results yet</p>
              <p className="text-sm text-muted-foreground mt-1">Run a GEO check to start tracking visibility.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Query</th>
                    <th className="pb-2 font-medium text-muted-foreground">Platform</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Mentioned</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Cited</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Position</th>
                    <th className="pb-2 font-medium text-muted-foreground">Competitors Also Mentioned</th>
                    <th className="pb-2 font-medium text-muted-foreground">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentScores ?? []).map((score) => (
                    <tr key={score.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 max-w-[200px] truncate">{score.query}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="secondary">{platformLabel(score.platform)}</Badge>
                      </td>
                      <td className="py-2 text-center">
                        <span className={score.is_mentioned ? 'text-green-600 font-medium' : 'text-red-500'}>
                          {score.is_mentioned ? '\u2713' : '\u2717'}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={score.is_cited ? 'text-green-600 font-medium' : 'text-red-500'}>
                          {score.is_cited ? '\u2713' : '\u2717'}
                        </span>
                      </td>
                      <td className="py-2 text-center">{score.position != null ? `#${score.position}` : '-'}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {(score.competitor_mentions ?? []).slice(0, 3).map((c, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                          {(score.competitor_mentions ?? []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(score.competitor_mentions ?? []).length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(score.checked_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section D: Competitor Visibility Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Competitor Visibility Comparison</CardTitle>
          <CardDescription>How often competitors appear vs your brand</CardDescription>
        </CardHeader>
        <CardContent>
          {competitorData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No competitor data available</p>
              <p className="text-sm text-muted-foreground mt-1">Competitor mentions are tracked during GEO checks.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, competitorData.length * 50)}>
              <BarChart data={competitorData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="mentionCount" name="Mentions" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
