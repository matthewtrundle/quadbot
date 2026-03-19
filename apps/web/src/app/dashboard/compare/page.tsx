'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { BarChart3, TrendingUp, CheckCircle, Mail, Lightbulb } from 'lucide-react';

const BRAND_COLORS = ['#2563EB', '#DC2626', '#16A34A', '#CA8A04', '#9333EA'];

const PERIODS = [
  { label: '7d', value: '7' },
  { label: '14d', value: '14' },
  { label: '30d', value: '30' },
  { label: '60d', value: '60' },
  { label: '90d', value: '90' },
];

const TREND_METRICS = [
  { label: 'Clicks', value: 'clicks' },
  { label: 'Impressions', value: 'impressions' },
  { label: 'CTR', value: 'ctr' },
  { label: 'Performance Score', value: 'performance_score' },
];

const KPI_ROWS = [
  { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'ctr', label: 'CTR' },
  { key: 'position', label: 'Position' },
  { key: 'performance_score', label: 'Performance Score' },
  { key: 'lcp_ms', label: 'LCP (ms)' },
  { key: 'cls', label: 'CLS' },
];

type Brand = {
  id: string;
  name: string;
};

type BrandKPI = {
  brand_id: string;
  brand_name: string;
  kpis: Record<string, { current: number; delta: number }>;
};

type TrendPoint = {
  date: string;
  [brandName: string]: string | number;
};

type RecommendationStats = {
  brand_id: string;
  brand_name: string;
  total: number;
  acceptance_rate: number;
  avg_confidence: number;
  avg_roi_score: number;
};

type ActionVelocity = {
  brand_id: string;
  brand_name: string;
  executed: number;
  pending: number;
};

type OutreachStats = {
  brand_id: string;
  brand_name: string;
  open_rate: number;
  click_rate: number;
};

type Signal = {
  id: string;
  title: string;
  confidence: number;
  domain: string;
};

type CompareData = {
  kpis: BrandKPI[];
  trends: Record<string, TrendPoint[]>;
  recommendations: RecommendationStats[];
  actions: ActionVelocity[];
  outreach: OutreachStats[];
  signals: Signal[];
};

function formatValue(key: string, value: number): string {
  if (key === 'ctr') return `${(value * 100).toFixed(2)}%`;
  if (key === 'cls') return value.toFixed(3);
  if (key === 'position') return value.toFixed(1);
  if (key === 'lcp_ms') return `${value.toFixed(0)}`;
  if (key === 'performance_score') return value.toFixed(0);
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(1);
}

function DeltaBadge({ delta, invertColor = false }: { delta: number; invertColor?: boolean }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  return (
    <span
      className={`ml-1.5 inline-flex items-center text-xs font-medium ${
        isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      {isPositive ? '\u25B2' : '\u25BC'} {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [period, setPeriod] = useState('30');
  const [trendMetric, setTrendMetric] = useState('clicks');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch brands on mount
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load brands');
        return r.json();
      })
      .then((d) => setBrands(d.brands || d))
      .catch(() => setError('Failed to load brands'))
      .finally(() => setBrandsLoading(false));
  }, []);

  const fetchComparison = useCallback(() => {
    if (selectedBrandIds.length < 2) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('brandIds', selectedBrandIds.join(','));
    params.set('period', period);
    fetch(`/api/dashboard/compare?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load comparison data');
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedBrandIds, period]);

  // Fetch when brands or period change
  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  function toggleBrand(brandId: string) {
    setSelectedBrandIds((prev) => {
      if (prev.includes(brandId)) {
        return prev.filter((id) => id !== brandId);
      }
      if (prev.length >= 5) return prev;
      return [...prev, brandId];
    });
  }

  const brandColorMap = new Map<string, string>();
  selectedBrandIds.forEach((id, i) => {
    brandColorMap.set(id, BRAND_COLORS[i % BRAND_COLORS.length]);
  });

  // Helper to find the best value index for recommendation scorecard
  function bestIndex(arr: number[], mode: 'max' | 'min' = 'max'): number {
    if (arr.length === 0) return -1;
    let bestIdx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (mode === 'max' ? arr[i] > arr[bestIdx] : arr[i] < arr[bestIdx]) {
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  return (
    <div className="space-y-6">
      {/* Brand Selector + Period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Multi-Brand Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Brand checkboxes */}
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Select 2-5 brands to compare</p>
              {brandsLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-24 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brands.map((brand) => {
                    const isSelected = selectedBrandIds.includes(brand.id);
                    const colorIdx = selectedBrandIds.indexOf(brand.id);
                    return (
                      <button
                        key={brand.id}
                        onClick={() => toggleBrand(brand.id)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full border"
                          style={{
                            backgroundColor: isSelected ? BRAND_COLORS[colorIdx % BRAND_COLORS.length] : 'transparent',
                            borderColor: isSelected ? BRAND_COLORS[colorIdx % BRAND_COLORS.length] : 'currentColor',
                          }}
                        />
                        {brand.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Period selector */}
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Period</p>
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <Button
                    key={p.value}
                    variant={period === p.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPeriod(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {selectedBrandIds.length < 2 && !loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Select at least 2 brands to compare</p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && selectedBrandIds.length >= 2 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchComparison}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Data sections */}
      {data && !loading && selectedBrandIds.length >= 2 && (
        <>
          {/* Section 1: KPI Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                KPI Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Metric</th>
                      {data.kpis.map((bk) => (
                        <th
                          key={bk.brand_id}
                          className="px-3 py-2 text-right font-medium"
                          style={{ color: brandColorMap.get(bk.brand_id) }}
                        >
                          {bk.brand_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {KPI_ROWS.map((row, rowIdx) => (
                      <tr
                        key={row.key}
                        className={`border-b border-border/50 ${
                          rowIdx % 2 === 0 ? 'bg-muted/30 dark:bg-muted/10' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 font-medium">{row.label}</td>
                        {data.kpis.map((bk) => {
                          const kpi = bk.kpis[row.key];
                          const invertColor = row.key === 'position' || row.key === 'lcp_ms' || row.key === 'cls';
                          return (
                            <td key={bk.brand_id} className="px-3 py-2.5 text-right">
                              {kpi ? (
                                <>
                                  <span className="font-medium">{formatValue(row.key, kpi.current)}</span>
                                  <DeltaBadge delta={kpi.delta} invertColor={invertColor} />
                                </>
                              ) : (
                                <span className="text-muted-foreground">--</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Trend Overlay Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trend Overlay</CardTitle>
                <Select value={trendMetric} onValueChange={setTrendMetric}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TREND_METRICS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {data.trends[trendMetric] && data.trends[trendMetric].length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trends[trendMetric]}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend />
                    {data.kpis.map((bk) => (
                      <Line
                        key={bk.brand_id}
                        type="monotone"
                        dataKey={bk.brand_name}
                        stroke={brandColorMap.get(bk.brand_id)}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-muted-foreground">No trend data available for this metric.</p>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Recommendation Scorecard */}
          {data.recommendations && data.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Recommendation Scorecard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {(() => {
                    const recs = data.recommendations;
                    const bestTotal = bestIndex(recs.map((r) => r.total));
                    const bestAcceptance = bestIndex(recs.map((r) => r.acceptance_rate));
                    const bestConfidence = bestIndex(recs.map((r) => r.avg_confidence));
                    const bestRoi = bestIndex(recs.map((r) => r.avg_roi_score));

                    return recs.map((rec, idx) => (
                      <Card key={rec.brand_id} className="border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm" style={{ color: brandColorMap.get(rec.brand_id) }}>
                            {rec.brand_name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div
                            className={`flex justify-between rounded px-2 py-1 ${
                              idx === bestTotal ? 'bg-green-500/10' : ''
                            }`}
                          >
                            <span className="text-muted-foreground">Total Recs</span>
                            <span className="font-medium">{rec.total}</span>
                          </div>
                          <div
                            className={`flex justify-between rounded px-2 py-1 ${
                              idx === bestAcceptance ? 'bg-green-500/10' : ''
                            }`}
                          >
                            <span className="text-muted-foreground">Acceptance</span>
                            <span className="font-medium">{(rec.acceptance_rate * 100).toFixed(1)}%</span>
                          </div>
                          <div
                            className={`flex justify-between rounded px-2 py-1 ${
                              idx === bestConfidence ? 'bg-green-500/10' : ''
                            }`}
                          >
                            <span className="text-muted-foreground">Avg Confidence</span>
                            <span className="font-medium">{rec.avg_confidence.toFixed(2)}</span>
                          </div>
                          <div
                            className={`flex justify-between rounded px-2 py-1 ${
                              idx === bestRoi ? 'bg-green-500/10' : ''
                            }`}
                          >
                            <span className="text-muted-foreground">Avg ROI</span>
                            <span className="font-medium">{rec.avg_roi_score.toFixed(2)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 4: Action Velocity */}
          {data.actions && data.actions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Action Velocity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, data.actions.length * 50)}>
                  <BarChart data={data.actions} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fill: 'currentColor' }} className="text-xs" />
                    <YAxis
                      type="category"
                      dataKey="brand_name"
                      width={120}
                      tick={{ fill: 'currentColor' }}
                      className="text-xs"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="executed" stackId="a" fill="#16A34A" name="Executed" />
                    <Bar dataKey="pending" stackId="a" fill="#CA8A04" name="Pending" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Section 5: Outreach Comparison */}
          {data.outreach && data.outreach.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Outreach Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Open Rate</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Click Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.outreach.map((o, idx) => (
                        <tr
                          key={o.brand_id}
                          className={`border-b border-border/50 ${idx % 2 === 0 ? 'bg-muted/30 dark:bg-muted/10' : ''}`}
                        >
                          <td className="px-3 py-2.5 font-medium" style={{ color: brandColorMap.get(o.brand_id) }}>
                            {o.brand_name}
                          </td>
                          <td className="px-3 py-2.5 text-right">{(o.open_rate * 100).toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right">{(o.click_rate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 6: Cross-Brand Insights */}
          {data.signals && data.signals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  Cross-Brand Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.signals.map((signal) => (
                    <Card key={signal.id} className="border-border/50">
                      <CardContent className="p-4">
                        <p className="mb-2 font-medium leading-snug">{signal.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              signal.confidence >= 0.8 ? 'default' : signal.confidence >= 0.5 ? 'secondary' : 'outline'
                            }
                          >
                            {(signal.confidence * 100).toFixed(0)}% confidence
                          </Badge>
                          {signal.domain && <Badge variant="outline">{signal.domain}</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
