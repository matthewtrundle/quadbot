'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  MousePointer,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Loader2,
  Send,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Summary {
  totalSent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

interface StepPerformance {
  stepOrder: number;
  subject: string;
  totalSent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
}

interface DailyStat {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

interface CampaignComparison {
  id: string;
  name: string;
  status: string;
  totalSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  startedAt: string | null;
}

interface TopSubject {
  subject: string;
  sent: number;
  openRate: number;
  clickRate: number;
}

interface HourlyData {
  hour: number;
  sent: number;
  opened: number;
  openRate: number;
}

interface AnalyticsData {
  summary: Summary;
  stepPerformance: StepPerformance[];
  leadFunnel: FunnelStage[];
  dailyStats: DailyStat[];
  campaigns: CampaignComparison[];
  topSubjects: TopSubject[];
  hourlyDistribution: HourlyData[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

type SortKey = 'name' | 'status' | 'totalSent' | 'openRate' | 'clickRate' | 'replyRate' | 'startedAt';
type SortDir = 'asc' | 'desc';

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rateColor(rate: number): string {
  if (rate >= 0.5) return 'bg-emerald-500/30 text-emerald-300';
  if (rate >= 0.3) return 'bg-emerald-500/20 text-emerald-400';
  if (rate >= 0.15) return 'bg-emerald-500/10 text-emerald-500';
  return 'bg-transparent text-muted-foreground';
}

function rateCellBg(rate: number): string {
  const intensity = Math.min(rate * 2, 1);
  const alpha = Math.round(intensity * 25);
  return `rgba(16, 185, 129, ${alpha / 100})`;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function TimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function HourlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: HourlyData }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-card/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1 text-sm">
        <div>
          Sent: <span className="font-medium">{d.sent}</span>
        </div>
        <div>
          Opened: <span className="font-medium">{d.opened}</span>
        </div>
        <div>
          Open Rate: <span className="font-medium">{pct(d.openRate)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const brandId = params.id;

  const [period, setPeriod] = useState(30);
  const [campaignId, setCampaignId] = useState<string>('all');
  const [campaignList, setCampaignList] = useState<Campaign[]>([]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Campaign comparison sort state
  const [sortKey, setSortKey] = useState<SortKey>('totalSent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fetch campaign list
  useEffect(() => {
    fetch(`/api/outreach/campaigns?brandId=${brandId}`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setCampaignList(list);
      })
      .catch(() => {});
  }, [brandId]);

  // Fetch analytics
  useEffect(() => {
    setLoading(true);
    setError(null);
    const cid = campaignId === 'all' ? '' : campaignId;
    const qs = new URLSearchParams({ brandId, period: String(period) });
    if (cid) qs.set('campaignId', cid);

    fetch(`/api/outreach/analytics/advanced?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load analytics');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [brandId, period, campaignId]);

  // Sort campaigns
  const sortedCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    return [...data.campaigns].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data?.campaigns, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  // Ordered funnel stages
  const orderedFunnel = useMemo(() => {
    if (!data?.leadFunnel) return [];
    const order: string[] = ['enrolled'];
    const stepStages = data.leadFunnel
      .filter((f) => f.stage.startsWith('step_'))
      .sort((a, b) => {
        const aNum = parseInt(a.stage.replace('step_', '').replace('_sent', ''), 10);
        const bNum = parseInt(b.stage.replace('step_', '').replace('_sent', ''), 10);
        return aNum - bNum;
      })
      .map((f) => f.stage);
    order.push(...stepStages, 'replied', 'completed');
    const stageMap = new Map(data.leadFunnel.map((f) => [f.stage, f]));
    return order.filter((s) => stageMap.has(s)).map((s) => stageMap.get(s)!);
  }, [data?.leadFunnel]);

  const totalFunnelLeads = useMemo(() => {
    return orderedFunnel.reduce((sum, f) => sum + f.count, 0);
  }, [orderedFunnel]);

  // Format daily stats for chart
  const chartData = useMemo(() => {
    if (!data?.dailyStats) return [];
    return data.dailyStats.map((d) => ({
      ...d,
      date: formatDate(d.date),
    }));
  }, [data?.dailyStats]);

  // Format hourly data for chart
  const hourlyChartData = useMemo(() => {
    if (!data?.hourlyDistribution) return [];
    // Fill in missing hours
    const hourMap = new Map(data.hourlyDistribution.map((h) => [h.hour, h]));
    const result: Array<HourlyData & { label: string }> = [];
    for (let h = 6; h <= 22; h++) {
      const existing = hourMap.get(h);
      result.push({
        hour: h,
        sent: existing?.sent ?? 0,
        opened: existing?.opened ?? 0,
        openRate: existing?.openRate ?? 0,
        label: formatHour(h),
      });
    }
    return result;
  }, [data?.hourlyDistribution]);

  // Best open rate hour
  const bestHour = useMemo(() => {
    if (!hourlyChartData.length) return null;
    return hourlyChartData.reduce((best, h) => (h.openRate > best.openRate ? h : best), hourlyChartData[0]);
  }, [hourlyChartData]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detailed performance metrics across your outreach campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Campaign filter */}
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaignList.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period selector */}
          <div className="flex items-center rounded-lg border border-border/50 bg-card p-1">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p.value)}
                className="h-7 px-3 text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Section 1: Summary Cards ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              label="Sent"
              value={data.summary.totalSent.toLocaleString()}
              icon={<Send className="h-4 w-4" />}
              color="text-slate-400"
              bgColor="bg-slate-500/10"
            />
            <SummaryCard
              label="Open Rate"
              value={pct(data.summary.openRate)}
              icon={<Mail className="h-4 w-4" />}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <SummaryCard
              label="Click Rate"
              value={pct(data.summary.clickRate)}
              icon={<MousePointer className="h-4 w-4" />}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
            />
            <SummaryCard
              label="Reply Rate"
              value={pct(data.summary.replyRate)}
              icon={<MessageSquare className="h-4 w-4" />}
              color="text-purple-400"
              bgColor="bg-purple-500/10"
            />
            <SummaryCard
              label="Bounce Rate"
              value={pct(data.summary.bounceRate)}
              icon={<AlertTriangle className="h-4 w-4" />}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            />
          </div>

          {/* ── Section 2: Engagement Timeline ───────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                Engagement Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradClicked" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradReplied" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<TimelineTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Area
                      type="monotone"
                      dataKey="sent"
                      stroke="#94a3b8"
                      fill="url(#gradSent)"
                      strokeWidth={2}
                      name="Sent"
                    />
                    <Area
                      type="monotone"
                      dataKey="opened"
                      stroke="#3b82f6"
                      fill="url(#gradOpened)"
                      strokeWidth={2}
                      name="Opened"
                    />
                    <Area
                      type="monotone"
                      dataKey="clicked"
                      stroke="#10b981"
                      fill="url(#gradClicked)"
                      strokeWidth={2}
                      name="Clicked"
                    />
                    <Area
                      type="monotone"
                      dataKey="replied"
                      stroke="#a855f7"
                      fill="url(#gradReplied)"
                      strokeWidth={2}
                      name="Replied"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No engagement data for this period" />
              )}
            </CardContent>
          </Card>

          {/* ── Section 3: Sequence Performance Heatmap ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-400" />
                Sequence Performance Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.stepPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Step</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Subject</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Sent</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Open Rate</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Click Rate</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Reply Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stepPerformance.map((step) => (
                        <tr
                          key={step.stepOrder}
                          className="border-b border-border/30 transition-colors hover:bg-muted/30"
                        >
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="font-mono text-xs">
                              #{step.stepOrder + 1}
                            </Badge>
                          </td>
                          <td className="max-w-[300px] truncate px-3 py-2.5 font-medium">
                            {step.subject || '(no subject)'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{step.totalSent.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className="inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums"
                              style={{ backgroundColor: rateCellBg(step.openRate) }}
                            >
                              {pct(step.openRate)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className="inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums"
                              style={{ backgroundColor: rateCellBg(step.clickRate) }}
                            >
                              {pct(step.clickRate)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className="inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums"
                              style={{ backgroundColor: rateCellBg(step.replyRate) }}
                            >
                              {pct(step.replyRate)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No sequence step data available" />
              )}
            </CardContent>
          </Card>

          {/* ── Section 4: Lead Funnel ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4 text-purple-400" />
                Lead Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderedFunnel.length > 0 ? (
                <div className="space-y-2">
                  {orderedFunnel.map((stage, i) => {
                    const widthPct = totalFunnelLeads > 0 ? Math.max((stage.count / totalFunnelLeads) * 100, 8) : 8;
                    const prevCount = i > 0 ? orderedFunnel[i - 1].count : stage.count;
                    const dropOff =
                      prevCount > 0 && i > 0 ? (((prevCount - stage.count) / prevCount) * 100).toFixed(0) : null;

                    return (
                      <div key={stage.stage} className="flex items-center gap-3">
                        <div className="w-28 flex-shrink-0 text-right text-xs font-medium text-muted-foreground">
                          {formatStageName(stage.stage)}
                        </div>
                        <div className="relative flex-1">
                          <div
                            className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-all"
                            style={{
                              width: `${widthPct}%`,
                              background: funnelGradient(i),
                            }}
                          >
                            <span className="text-white/90">{stage.count.toLocaleString()}</span>
                            <span className="text-white/60">{(stage.percentage * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        {dropOff !== null && (
                          <div className="w-16 flex-shrink-0 text-left text-xs text-red-400/70">-{dropOff}%</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState message="No funnel data available" />
              )}
            </CardContent>
          </Card>

          {/* ── Section 5: Campaign Comparison ───────────────────────── */}
          {campaignId === 'all' && data.campaigns.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  Campaign Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        {(
                          [
                            ['name', 'Campaign'],
                            ['status', 'Status'],
                            ['totalSent', 'Sent'],
                            ['openRate', 'Open Rate'],
                            ['clickRate', 'Click Rate'],
                            ['replyRate', 'Reply Rate'],
                            ['startedAt', 'Started'],
                          ] as [SortKey, string][]
                        ).map(([key, label]) => (
                          <th
                            key={key}
                            className="cursor-pointer px-3 py-2.5 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => toggleSort(key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {sortKey === key &&
                                (sortDir === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                ))}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCampaigns.map((c) => {
                        const bestOpen = Math.max(...data.campaigns.map((x) => x.openRate));
                        const bestClick = Math.max(...data.campaigns.map((x) => x.clickRate));
                        const bestReply = Math.max(...data.campaigns.map((x) => x.replyRate));
                        return (
                          <tr key={c.id} className="border-b border-border/30 transition-colors hover:bg-muted/30">
                            <td className="px-3 py-2.5 font-medium">{c.name}</td>
                            <td className="px-3 py-2.5">
                              <Badge
                                variant={c.status === 'active' ? 'default' : 'outline'}
                                className="text-xs capitalize"
                              >
                                {c.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">{c.totalSent.toLocaleString()}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`tabular-nums ${c.openRate === bestOpen && bestOpen > 0 ? 'font-bold text-emerald-400' : ''}`}
                              >
                                {pct(c.openRate)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`tabular-nums ${c.clickRate === bestClick && bestClick > 0 ? 'font-bold text-emerald-400' : ''}`}
                              >
                                {pct(c.clickRate)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`tabular-nums ${c.replyRate === bestReply && bestReply > 0 ? 'font-bold text-emerald-400' : ''}`}
                              >
                                {pct(c.replyRate)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {c.startedAt
                                ? new Date(c.startedAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Section 6: Best Time to Send ─────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  Best Time to Send
                </CardTitle>
                {bestHour && bestHour.openRate > 0 && (
                  <Badge variant="outline" className="text-xs text-emerald-400">
                    Peak: {formatHour(bestHour.hour)} ({pct(bestHour.openRate)} open rate)
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {hourlyChartData.some((h) => h.sent > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hourlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => pct(v)}
                      domain={[0, 'auto']}
                    />
                    <Tooltip content={<HourlyTooltip />} />
                    <Bar dataKey="openRate" name="Open Rate" radius={[4, 4, 0, 0]} fill="#f59e0b" fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hourly data available for this period" />
              )}
            </CardContent>
          </Card>

          {/* ── Section 7: Top Subjects ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-cyan-400" />
                Top Performing Subjects
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topSubjects.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">#</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Subject</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Sent</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Open Rate</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Click Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topSubjects.map((subj, i) => (
                        <tr key={i} className="border-b border-border/30 transition-colors hover:bg-muted/30">
                          <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="max-w-[400px] truncate px-3 py-2.5 font-medium">{subj.subject}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{subj.sent.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums ${rateColor(subj.openRate)}`}
                            >
                              {pct(subj.openRate)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums ${rateColor(subj.clickRate)}`}
                            >
                              {pct(subj.clickRate)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No subject performance data available" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  color,
  bgColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          </div>
          <div className={`rounded-lg p-2 ${bgColor} ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">{message}</div>;
}

function formatStageName(stage: string): string {
  if (stage === 'enrolled') return 'Enrolled';
  if (stage === 'replied') return 'Replied';
  if (stage === 'completed') return 'Completed';
  // step_N_sent -> Step N
  const match = stage.match(/step_(\d+)_sent/);
  if (match) return `Step ${parseInt(match[1], 10) + 1}`;
  return stage;
}

function funnelGradient(index: number): string {
  const colors = [
    'linear-gradient(90deg, #3b82f6, #6366f1)',
    'linear-gradient(90deg, #6366f1, #8b5cf6)',
    'linear-gradient(90deg, #8b5cf6, #a855f7)',
    'linear-gradient(90deg, #a855f7, #c084fc)',
    'linear-gradient(90deg, #c084fc, #d8b4fe)',
    'linear-gradient(90deg, #10b981, #34d399)',
    'linear-gradient(90deg, #f59e0b, #fbbf24)',
  ];
  return colors[index % colors.length];
}
