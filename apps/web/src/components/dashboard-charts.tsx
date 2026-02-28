'use client';

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Recommendation = {
  priority: string | null;
  source: string | null;
  created_at: string | Date | null;
};

type Props = {
  recommendations: Recommendation[];
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

const SOURCE_COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#f43f5e',
];

export function DashboardCharts({ recommendations }: Props) {
  // --- Priority Distribution ---
  const priorityCounts = recommendations.reduce<Record<string, number>>((acc, r) => {
    const key = r.priority ?? 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // --- Source Breakdown ---
  const sourceCounts = recommendations.reduce<Record<string, number>>((acc, r) => {
    const key = r.source ?? 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const sourceData = Object.entries(sourceCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // --- Trend Over Time (last 30 days) ---
  const now = new Date();
  const dayBuckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayBuckets[key] = 0;
  }

  recommendations.forEach((r) => {
    if (!r.created_at) return;
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    if (key in dayBuckets) {
      dayBuckets[key]++;
    }
  });

  const trendData = Object.entries(dayBuckets).map(([date, count]) => ({
    date: date.slice(5), // MM-DD
    count,
  }));

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Priority Distribution - Donut Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Priority Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {priorityData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PRIORITY_COLORS[entry.name] ?? '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    color: 'hsl(var(--card-foreground))',
                    fontSize: '0.75rem',
                  }}
                  formatter={(value, name) => [value ?? 0, name ?? '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {priorityData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PRIORITY_COLORS[entry.name] ?? '#6b7280' }}
                />
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Source Breakdown - Horizontal Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Source Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sourceData}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={90}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    color: 'hsl(var(--card-foreground))',
                    fontSize: '0.75rem',
                  }}
                  formatter={(value) => [value ?? 0, 'count']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trend Over Time - Line Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Trend Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    color: 'hsl(var(--card-foreground))',
                    fontSize: '0.75rem',
                  }}
                  formatter={(value) => [value ?? 0, 'recommendations']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#8b5cf6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
