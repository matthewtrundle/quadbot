'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type ActionVelocityChartProps = {
  actions: Record<string, { total: number; executed: number; pending: number; executionRate: number }>;
  brands: { id: string; name: string }[];
  brandColors: Record<string, string>;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; payload: { executionRate: number } }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const rate = payload[0]?.payload?.executionRate;

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3">
      <p className="text-xs font-medium mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
      {rate != null && (
        <div className="text-xs text-muted-foreground mt-1 pt-1 border-t">
          Execution rate: {(rate * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export function ActionVelocityChart({ actions, brands }: ActionVelocityChartProps) {
  const chartData = brands
    .filter((brand) => actions[brand.id])
    .map((brand) => {
      const data = actions[brand.id];
      return {
        name: brand.name,
        executed: data.executed,
        pending: data.pending,
        executionRate: data.executionRate,
      };
    });

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        No action data available.
      </div>
    );
  }

  const chartHeight = brands.length * 60 + 40;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <XAxis
          type="number"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={100}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
        />
        <Bar dataKey="executed" stackId="a" fill="#16A34A" radius={[0, 0, 0, 0]} name="Executed" />
        <Bar dataKey="pending" stackId="a" fill="#CA8A04" radius={[0, 4, 4, 0]} name="Pending" />
      </BarChart>
    </ResponsiveContainer>
  );
}
