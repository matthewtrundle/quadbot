'use client';

type ComparisonTableProps = {
  metrics: Record<string, Record<string, { current: number; previous: number; delta: number; source: string }>>;
  brands: { id: string; name: string }[];
  brandColors: Record<string, string>;
};

const METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; format: (v: number) => string; higherIsBetter: boolean }
> = {
  clicks: { label: 'Clicks', unit: '', format: (v) => v.toLocaleString(), higherIsBetter: true },
  impressions: { label: 'Impressions', unit: '', format: (v) => v.toLocaleString(), higherIsBetter: true },
  ctr: { label: 'CTR', unit: '%', format: (v) => `${(v * 100).toFixed(2)}%`, higherIsBetter: true },
  position: { label: 'Position', unit: '', format: (v) => v.toFixed(1), higherIsBetter: false },
  performance_score: { label: 'Performance Score', unit: '', format: (v) => v.toFixed(0), higherIsBetter: true },
  lcp_ms: { label: 'LCP', unit: 'ms', format: (v) => `${v.toLocaleString()} ms`, higherIsBetter: false },
  cls: { label: 'CLS', unit: '', format: (v) => v.toFixed(3), higherIsBetter: false },
};

const METRIC_ORDER = ['clicks', 'impressions', 'ctr', 'position', 'performance_score', 'lcp_ms', 'cls'];

function snakeToTitle(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function DeltaBadge({ delta, higherIsBetter }: { delta: number; higherIsBetter: boolean }) {
  if (delta === 0) return null;
  const isPositive = higherIsBetter ? delta > 0 : delta < 0;
  const arrow = delta > 0 ? '▲' : '▼';
  const pct = Math.abs(delta * 100).toFixed(1);

  return (
    <span
      className={`ml-1.5 inline-flex items-center text-[10px] font-medium px-1 py-0.5 rounded ${
        isPositive
          ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950'
          : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950'
      }`}
    >
      {arrow} {pct}%
    </span>
  );
}

export function ComparisonTable({ metrics, brands, brandColors }: ComparisonTableProps) {
  if (brands.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No brands selected for comparison.
      </div>
    );
  }

  const availableMetrics = METRIC_ORDER.filter((m) => metrics[m]);

  if (availableMetrics.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No metric data available.
      </div>
    );
  }

  // Find best value per metric
  const bestByMetric: Record<string, string> = {};
  for (const metricKey of availableMetrics) {
    const config = METRIC_CONFIG[metricKey];
    let bestBrandId: string | null = null;
    let bestValue = config?.higherIsBetter ? -Infinity : Infinity;

    for (const brand of brands) {
      const cell = metrics[metricKey]?.[brand.id];
      if (!cell) continue;
      const isBetter = config?.higherIsBetter ? cell.current > bestValue : cell.current < bestValue;
      if (isBetter) {
        bestValue = cell.current;
        bestBrandId = brand.id;
      }
    }

    if (bestBrandId) {
      bestByMetric[metricKey] = bestBrandId;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground">Metric</th>
            {brands.map((brand) => (
              <th
                key={brand.id}
                className="text-right py-2.5 px-3 font-semibold"
                style={{ color: brandColors[brand.id] }}
              >
                {brand.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {availableMetrics.map((metricKey, idx) => {
            const config = METRIC_CONFIG[metricKey] ?? {
              label: snakeToTitle(metricKey),
              unit: '',
              format: (v: number) => v.toString(),
              higherIsBetter: true,
            };

            return (
              <tr key={metricKey} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                <td className="py-2.5 px-3 font-medium text-foreground">
                  {config.label}
                  {config.unit && <span className="text-muted-foreground text-xs ml-1">({config.unit})</span>}
                </td>
                {brands.map((brand) => {
                  const cell = metrics[metricKey]?.[brand.id];
                  const isBest = bestByMetric[metricKey] === brand.id;

                  if (!cell) {
                    return (
                      <td key={brand.id} className="text-right py-2.5 px-3 text-muted-foreground">
                        --
                      </td>
                    );
                  }

                  return (
                    <td
                      key={brand.id}
                      className={`text-right py-2.5 px-3 ${isBest ? 'bg-primary/10 font-semibold' : ''}`}
                    >
                      {config.format(cell.current)}
                      <DeltaBadge delta={cell.delta} higherIsBetter={config.higherIsBetter} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
