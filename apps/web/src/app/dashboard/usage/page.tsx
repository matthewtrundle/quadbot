'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, DollarSign, Zap, TrendingUp, Clock, Bot } from 'lucide-react';

// Anthropic pricing (per 1M tokens) as of 2024
const PRICING = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  default: { input: 3.0, output: 15.0 }, // Default to Sonnet pricing
};

type UsageData = {
  summary: {
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    period_start: string;
    period_end: string;
  };
  by_source: Array<{
    source: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
  by_brand: Array<{
    brand_id: string;
    brand_name: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
  by_model: Array<{
    model: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
  recent_activity: Array<{
    id: string;
    source: string;
    brand_name: string;
    title: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    created_at: string;
  }>;
};

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatSourceName(source: string): string {
  return source
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getSourceIcon(source: string): string {
  const icons: Record<string, string> = {
    gsc_daily_digest: '📊',
    content_optimizer: '✍️',
    ads_performance_digest: '📈',
    analytics_insights: '🔍',
    cross_channel_correlator: '🔗',
    trend_scan: '📡',
    prompt_scorer: '⭐',
  };
  return icons[source] || '🤖';
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    fetchUsage();
  }, [period]);

  const fetchUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/usage?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }
      const data = await response.json();
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading usage data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-6 text-center text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!usage) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">API Usage & Costs</h2>
          <p className="text-sm text-muted-foreground">
            Track agent activity and Anthropic API spending
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(usage.summary.total_calls)}</div>
            <p className="text-xs text-muted-foreground">Agent invocations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(usage.summary.total_input_tokens)}
            </div>
            <p className="text-xs text-muted-foreground">Prompts sent to Claude</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(usage.summary.total_output_tokens)}
            </div>
            <p className="text-xs text-muted-foreground">Responses generated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(usage.summary.total_cost_usd)}</div>
            <p className="text-xs text-muted-foreground">Based on Anthropic pricing</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Agent/Source */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Usage by Agent
            </CardTitle>
            <CardDescription>API costs broken down by agent type</CardDescription>
          </CardHeader>
          <CardContent>
            {usage.by_source.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent activity yet</p>
            ) : (
              <div className="space-y-4">
                {usage.by_source.map((item) => (
                  <div key={item.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getSourceIcon(item.source)}</span>
                      <div>
                        <p className="font-medium">{formatSourceName(item.source)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.calls} calls · {formatNumber(item.input_tokens + item.output_tokens)}{' '}
                          tokens
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{formatCurrency(item.cost_usd)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Brand */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Usage by Brand
            </CardTitle>
            <CardDescription>API costs broken down by brand</CardDescription>
          </CardHeader>
          <CardContent>
            {usage.by_brand.length === 0 ? (
              <p className="text-sm text-muted-foreground">No brand activity yet</p>
            ) : (
              <div className="space-y-4">
                {usage.by_brand.map((item) => (
                  <div key={item.brand_id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.brand_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.calls} calls · {formatNumber(item.input_tokens + item.output_tokens)}{' '}
                        tokens
                      </p>
                    </div>
                    <Badge variant="secondary">{formatCurrency(item.cost_usd)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Agent Activity
          </CardTitle>
          <CardDescription>Latest API calls made by agents</CardDescription>
        </CardHeader>
        <CardContent>
          {usage.recent_activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {usage.recent_activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getSourceIcon(item.source)}</span>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.brand_name} · {formatSourceName(item.source)} ·{' '}
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="mb-1">
                      {formatNumber(item.input_tokens + item.output_tokens)} tokens
                    </Badge>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.cost_usd)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Info */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>Pricing Note:</strong> Costs are estimated based on Anthropic&apos;s published
            pricing. Claude Sonnet: $3/1M input tokens, $15/1M output tokens. Actual costs may vary
            based on your Anthropic plan.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
