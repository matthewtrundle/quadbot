'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RecommendationScorecardProps = {
  recommendations: Record<
    string,
    {
      total: number;
      approved: number;
      rejected: number;
      pending: number;
      acceptanceRate: number;
      avgConfidence: number;
      avgRoiScore: number;
    }
  >;
  brands: { id: string; name: string }[];
  brandColors: Record<string, string>;
};

type StatKey = 'total' | 'acceptanceRate' | 'avgConfidence' | 'avgRoiScore';

const STAT_CONFIG: { key: StatKey; label: string; format: (v: number) => string; higherIsBetter: boolean }[] = [
  { key: 'total', label: 'Total Recs', format: (v) => v.toLocaleString(), higherIsBetter: true },
  { key: 'acceptanceRate', label: 'Acceptance Rate', format: (v) => `${(v * 100).toFixed(1)}%`, higherIsBetter: true },
  { key: 'avgConfidence', label: 'Avg Confidence', format: (v) => `${(v * 100).toFixed(0)}%`, higherIsBetter: true },
  { key: 'avgRoiScore', label: 'Avg ROI', format: (v) => v.toFixed(2), higherIsBetter: true },
];

export function RecommendationScorecard({ recommendations, brands, brandColors }: RecommendationScorecardProps) {
  const activeBrands = brands.filter((b) => recommendations[b.id]);

  if (activeBrands.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No recommendation data available.
      </div>
    );
  }

  // Find best values across brands for each stat
  const bestValues: Record<StatKey, { brandId: string; value: number }> = {} as Record<
    StatKey,
    { brandId: string; value: number }
  >;

  for (const stat of STAT_CONFIG) {
    let bestBrandId: string | null = null;
    let bestValue = -Infinity;

    for (const brand of activeBrands) {
      const data = recommendations[brand.id];
      if (!data) continue;
      const value = data[stat.key];
      if (value > bestValue) {
        bestValue = value;
        bestBrandId = brand.id;
      }
    }

    if (bestBrandId) {
      bestValues[stat.key] = { brandId: bestBrandId, value: bestValue };
    }
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {activeBrands.map((brand) => {
        const data = recommendations[brand.id];
        const color = brandColors[brand.id] ?? '#6b7280';

        return (
          <Card key={brand.id} className="overflow-hidden">
            <div className="flex">
              <div className="w-1 shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{brand.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {STAT_CONFIG.map((stat) => {
                      const value = data[stat.key];
                      const isBest = bestValues[stat.key]?.brandId === brand.id && activeBrands.length > 1;

                      return (
                        <div
                          key={stat.key}
                          className={`rounded-md px-2.5 py-2 ${isBest ? 'ring-1 ring-primary/40 bg-primary/5' : ''}`}
                        >
                          <p className="text-[11px] text-muted-foreground leading-tight">{stat.label}</p>
                          <p className="text-base font-semibold mt-0.5">{stat.format(value)}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
