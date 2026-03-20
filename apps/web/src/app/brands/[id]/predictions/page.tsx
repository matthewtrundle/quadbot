'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Prediction {
  id: string;
  brand_id: string;
  metric_key: string;
  source: string;
  predicted_value: number;
  confidence: number;
  prediction_date: string;
  actual_value: number | null;
  accuracy: number | null;
  context: Record<string, unknown>;
  model_version: string | null;
  created_at: string;
}

interface AnomalyAlert {
  id: string;
  brand_id: string;
  metric_key: string;
  source: string;
  alert_type: string;
  severity: string;
  current_value: number;
  expected_value: number;
  deviation_pct: number;
  description: string;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  context: Record<string, unknown>;
  detected_at: string;
}

interface ForecastData {
  predictions: Prediction[];
  anomalies: AnomalyAlert[];
  metricKeys: string[];
  summary: {
    totalPredictions: number;
    avgConfidence: number;
    avgAccuracy: number;
    activeAnomalies: number;
    maxSeverity: string;
  };
  accuracyBySource: Array<{
    source: string;
    avgAccuracy: number;
    count: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ALERT_TYPE_COLORS: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  spike: 'destructive',
  drop: 'warning',
  trend_change: 'warning',
  outlier: 'default',
};

const SEVERITY_COLORS: Record<string, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

function accuracyColor(accuracy: number): string {
  if (accuracy > 80) return 'text-green-600';
  if (accuracy > 60) return 'text-yellow-600';
  return 'text-red-600';
}

function accuracyBarColor(accuracy: number): string {
  if (accuracy > 80) return '#22c55e';
  if (accuracy > 60) return '#eab308';
  return '#ef4444';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PredictionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const fetchForecastData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/analytics/forecast`);
      if (!res.ok) throw new Error('Failed to fetch forecast data');
      const data: ForecastData = await res.json();
      setForecastData(data);
      if (!selectedMetric && data.metricKeys.length > 0) {
        setSelectedMetric(data.metricKeys[0]);
      }
    } catch {
      // silently fail, user sees empty state
    } finally {
      setLoading(false);
    }
  }, [brandId, selectedMetric]);

  useEffect(() => {
    fetchForecastData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const handleGeneratePredictions = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/predictions/generate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate predictions');
      await fetchForecastData();
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  }, [brandId, fetchForecastData]);

  const handleDetectAnomalies = useCallback(async () => {
    setDetecting(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/anomalies`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to detect anomalies');
      await fetchForecastData();
    } catch {
      // silently fail
    } finally {
      setDetecting(false);
    }
  }, [brandId, fetchForecastData]);

  const handleAcknowledgeAnomaly = useCallback(
    async (anomalyId: string) => {
      try {
        const res = await fetch(`/api/brands/${brandId}/anomalies/${anomalyId}/acknowledge`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to acknowledge anomaly');
        await fetchForecastData();
      } catch {
        // silently fail
      }
    },
    [brandId, fetchForecastData],
  );

  // ─── Chart Data ──────────────────────────────────────────────────────────────

  const now = new Date();

  const chartData = (() => {
    if (!forecastData || !selectedMetric) return [];

    const metricPredictions = forecastData.predictions
      .filter((p) => p.metric_key === selectedMetric)
      .sort((a, b) => new Date(a.prediction_date).getTime() - new Date(b.prediction_date).getTime());

    const dataMap = new Map<
      string,
      {
        date: string;
        historical?: number;
        predicted?: number;
        confidenceUpper?: number;
        confidenceLower?: number;
      }
    >();

    for (const p of metricPredictions) {
      const dateKey = formatDate(p.prediction_date);
      const predDate = new Date(p.prediction_date);
      const isHistorical = predDate <= now;
      const value = isHistorical ? (p.actual_value ?? p.predicted_value) : p.predicted_value;
      const confidenceRange = p.predicted_value * (1 - p.confidence) * 0.5;

      const existing = dataMap.get(dateKey) || { date: dateKey };

      if (isHistorical) {
        existing.historical = value;
      } else {
        existing.predicted = p.predicted_value;
        existing.confidenceUpper = p.predicted_value + confidenceRange;
        existing.confidenceLower = p.predicted_value - confidenceRange;
      }

      dataMap.set(dateKey, existing);
    }

    return Array.from(dataMap.values());
  })();

  const unacknowledgedAnomalies = (forecastData?.anomalies ?? [])
    .filter((a) => !a.is_acknowledged)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

  const accuracyData = (forecastData?.accuracyBySource ?? []).map((s) => ({
    source: s.source,
    accuracy: Math.round(s.avgAccuracy * 100),
    count: s.count,
    fill: accuracyBarColor(s.avgAccuracy * 100),
  }));

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Predictive Analytics</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
              <span className="ml-2 text-sm text-muted-foreground">Loading forecast data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = forecastData?.summary ?? {
    totalPredictions: 0,
    avgConfidence: 0,
    avgAccuracy: 0,
    activeAnomalies: 0,
    maxSeverity: 'low',
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Predictive Analytics</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleGeneratePredictions} disabled={generating}>
            {generating && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            Generate Predictions
          </Button>
          <Button variant="outline" size="sm" onClick={handleDetectAnomalies} disabled={detecting}>
            {detecting && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            Detect Anomalies
          </Button>
        </div>
      </div>

      {/* Section 1: Model Health Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Predictions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalPredictions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.avgConfidence > 0 ? `${(summary.avgConfidence * 100).toFixed(1)}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${summary.avgAccuracy > 0 ? accuracyColor(summary.avgAccuracy * 100) : ''}`}
            >
              {summary.avgAccuracy > 0 ? `${(summary.avgAccuracy * 100).toFixed(1)}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Anomalies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{summary.activeAnomalies}</p>
              {summary.activeAnomalies > 0 && (
                <Badge variant={SEVERITY_COLORS[summary.maxSeverity] ?? 'secondary'}>{summary.maxSeverity}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Trend Forecasts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Trend Forecasts</CardTitle>
              <CardDescription>Historical data with predicted future values</CardDescription>
            </div>
            {(forecastData?.metricKeys ?? []).length > 0 && (
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  {(forecastData?.metricKeys ?? []).map((key) => (
                    <SelectItem key={key} value={key}>
                      {key.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No forecast data available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate predictions to see trend forecasts with confidence bands.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                <Legend />
                <Area
                  type="monotone"
                  dataKey="confidenceUpper"
                  stroke="none"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.1}
                  name="Confidence Band"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="confidenceLower"
                  stroke="none"
                  fill="hsl(var(--background))"
                  fillOpacity={1}
                  name=" "
                  legendType="none"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="historical"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Historical"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="predicted"
                  stroke="hsl(var(--primary))"
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  name="Predicted"
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Anomaly Alerts */}
      <div>
        <h3 className="mb-3 text-lg font-medium">Anomaly Alerts</h3>
        {unacknowledgedAnomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium text-sm">No active anomalies</p>
            <p className="text-sm text-muted-foreground mt-1">
              Anomalies will appear here when unusual metric patterns are detected.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {unacknowledgedAnomalies.map((anomaly) => (
              <Card key={anomaly.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{anomaly.metric_key.replace(/_/g, ' ')}</span>
                        <Badge variant={ALERT_TYPE_COLORS[anomaly.alert_type] ?? 'secondary'}>
                          {anomaly.alert_type.replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant={SEVERITY_COLORS[anomaly.severity] ?? 'secondary'}>{anomaly.severity}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Current:{' '}
                          <span className="font-medium text-foreground">{anomaly.current_value.toFixed(2)}</span>
                        </span>
                        <span>
                          Expected:{' '}
                          <span className="font-medium text-foreground">{anomaly.expected_value.toFixed(2)}</span>
                        </span>
                        <span className={anomaly.deviation_pct > 0 ? 'text-red-600' : 'text-orange-600'}>
                          {anomaly.deviation_pct > 0 ? '+' : ''}
                          {anomaly.deviation_pct.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleAcknowledgeAnomaly(anomaly.id)}>
                      Acknowledge
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Section 4: Prediction Accuracy History */}
      <Card>
        <CardHeader>
          <CardTitle>Prediction Accuracy by Source</CardTitle>
          <CardDescription>Historical accuracy of predictions grouped by model source</CardDescription>
        </CardHeader>
        <CardContent>
          {accuracyData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No accuracy data available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Accuracy data appears after predictions are compared against actual values.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={accuracyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="source" tick={{ fontSize: 12 }} className="text-muted-foreground" />
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
                  formatter={(value) => [`${value}%`, 'Accuracy']}
                />
                <Bar dataKey="accuracy" name="Accuracy" radius={[4, 4, 0, 0]}>
                  {accuracyData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
