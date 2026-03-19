'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Gauge, Zap } from 'lucide-react';

type MetricSnapshot = {
  id: string;
  brand_id: string;
  source: string;
  metric_key: string;
  value: number;
  dimensions: Record<string, unknown>;
  captured_at: string;
};

type BenchmarksData = {
  benchmarks: MetricSnapshot[];
  pagespeed: MetricSnapshot[];
};

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-500';
  if (score >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

function getCwvBadge(
  metric: string,
  value: number,
): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  const thresholds: Record<string, { good: number; poor: number }> = {
    lcp_ms: { good: 2500, poor: 4000 },
    cls: { good: 0.1, poor: 0.25 },
    tbt_ms: { good: 200, poor: 600 },
  };

  const t = thresholds[metric];
  if (!t) return { label: 'N/A', variant: 'secondary' };

  if (value <= t.good) return { label: 'Good', variant: 'default' };
  if (value >= t.poor) return { label: 'Poor', variant: 'destructive' };
  return { label: 'Needs Work', variant: 'secondary' };
}

function getPercentileBadge(rank: number): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (rank >= 75) return { label: 'Top 25%', variant: 'default' };
  if (rank >= 50) return { label: 'Above Median', variant: 'secondary' };
  if (rank >= 25) return { label: 'Below Median', variant: 'outline' };
  return { label: 'Bottom 25%', variant: 'destructive' };
}

function formatMetricKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Ms$/, ' (ms)')
    .replace(/Cls/, 'CLS')
    .replace(/Lcp/, 'LCP')
    .replace(/Tbt/, 'TBT')
    .replace(/Fcp/, 'FCP');
}

function formatCwvValue(key: string, value: number): string {
  if (key === 'cls') return value.toFixed(3);
  if (key === 'performance_score') return value.toFixed(0);
  return `${value.toFixed(0)} ms`;
}

export default function BenchmarksPage() {
  const [data, setData] = useState<BenchmarksData | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/benchmarks')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load benchmarks');
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <span>Failed to load benchmarks. Please try refreshing.</span>
      </div>
    );
  }

  // Get latest pagespeed metrics (most recent snapshot per metric_key)
  const latestPagespeed = new Map<string, MetricSnapshot>();
  if (data?.pagespeed) {
    for (const snap of data.pagespeed) {
      if (!latestPagespeed.has(snap.metric_key)) {
        latestPagespeed.set(snap.metric_key, snap);
      }
    }
  }

  const performanceScore = latestPagespeed.get('performance_score');
  const cwvMetrics = ['lcp_ms', 'cls', 'tbt_ms'].map((key) => ({
    key,
    snapshot: latestPagespeed.get(key),
  }));
  const otherPagespeedMetrics = ['fcp_ms', 'speed_index_ms'].map((key) => ({
    key,
    snapshot: latestPagespeed.get(key),
  }));

  // Get latest benchmark metrics (most recent snapshot per metric_key)
  const latestBenchmarks = new Map<string, MetricSnapshot>();
  if (data?.benchmarks) {
    for (const snap of data.benchmarks) {
      if (!latestBenchmarks.has(snap.metric_key)) {
        latestBenchmarks.set(snap.metric_key, snap);
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* PageSpeed / Core Web Vitals */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">PageSpeed & Core Web Vitals</h2>
        </div>

        {latestPagespeed.size === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              PageSpeed data will appear after the PageSpeed monitor runs.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Performance Score */}
            {performanceScore && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    Performance Score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`text-5xl font-bold ${getScoreColor(performanceScore.value)}`}>
                    {performanceScore.value.toFixed(0)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(performanceScore.captured_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* CWV Metrics */}
            {cwvMetrics.map(({ key, snapshot }) =>
              snapshot ? (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardDescription>{formatMetricKey(key)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCwvValue(key, snapshot.value)}</div>
                    <div className="mt-2">
                      <Badge variant={getCwvBadge(key, snapshot.value).variant}>
                        {getCwvBadge(key, snapshot.value).label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(snapshot.captured_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ) : null,
            )}
          </div>
        )}

        {/* Additional PageSpeed Metrics */}
        {otherPagespeedMetrics.some((m) => m.snapshot) && (
          <div className="grid gap-4 md:grid-cols-2">
            {otherPagespeedMetrics.map(({ key, snapshot }) =>
              snapshot ? (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardDescription>{formatMetricKey(key)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCwvValue(key, snapshot.value)}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(snapshot.captured_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ) : null,
            )}
          </div>
        )}
      </div>

      {/* Industry Benchmarks */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Industry Benchmarks</h2>
        </div>

        {latestBenchmarks.size === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Benchmark data will appear after the benchmark generator runs. Requires at least 3 brands.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Brand vs. Industry</CardTitle>
              <CardDescription>How your metrics compare to other brands in the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from(latestBenchmarks.entries()).map(([metricKey, snapshot]) => {
                  const dims = snapshot.dimensions || {};
                  const brandValue = (dims.brand_value as number) ?? snapshot.value;
                  const median = dims.median as number | undefined;
                  const percentileRank = dims.percentile_rank as number | undefined;
                  const p25 = dims.p25 as number | undefined;
                  const p75 = dims.p75 as number | undefined;
                  const sampleSize = dims.sample_size as number | undefined;
                  const aboveMedian = median != null ? brandValue >= median : null;

                  return (
                    <div
                      key={metricKey}
                      className="flex items-center justify-between rounded-lg border border-border/50 p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatMetricKey(metricKey)}</span>
                          {aboveMedian !== null &&
                            (aboveMedian ? (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            ))}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>
                            Your value:{' '}
                            <span className="font-medium text-foreground">
                              {typeof brandValue === 'number' ? brandValue.toFixed(1) : '—'}
                            </span>
                          </span>
                          {median != null && (
                            <span>
                              Median: <span className="font-medium text-foreground">{median.toFixed(1)}</span>
                            </span>
                          )}
                          {p25 != null && p75 != null && (
                            <span className="hidden sm:inline">
                              Range: {p25.toFixed(1)} – {p75.toFixed(1)}
                            </span>
                          )}
                          {sampleSize != null && <span className="hidden sm:inline">n={sampleSize}</span>}
                        </div>
                      </div>
                      <div>
                        {percentileRank != null && (
                          <Badge variant={getPercentileBadge(percentileRank).variant}>
                            {getPercentileBadge(percentileRank).label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
