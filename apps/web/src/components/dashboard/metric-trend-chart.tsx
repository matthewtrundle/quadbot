'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type MetricTrendChartProps = {
  trendData: Record<string, { date: string; [metricKey: string]: number | string }[]>;
  brands: { id: string; name: string }[];
  selectedMetric: string;
  brandColors: Record<string, string>;
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3">
      <p className="text-xs font-medium mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MetricTrendChart({ trendData, brands, selectedMetric, brandColors }: MetricTrendChartProps) {
  // Merge all brand data into a unified array keyed by date
  const dateMap = new Map<string, Record<string, number | string>>();

  for (const brand of brands) {
    const brandData = trendData[brand.id];
    if (!brandData) continue;
    for (const point of brandData) {
      const existing = dateMap.get(point.date) ?? { date: formatDateLabel(point.date) };
      const value = point[selectedMetric];
      if (typeof value === 'number') {
        existing[brand.name] = value;
      }
      dateMap.set(point.date, existing);
    }
  }

  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, values]) => values);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No trend data available for this metric.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
        />
        {brands.map((brand) => (
          <Line
            key={brand.id}
            type="monotone"
            dataKey={brand.name}
            stroke={brandColors[brand.id] ?? '#6b7280'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
