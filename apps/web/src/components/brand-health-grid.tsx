import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

type BrandStat = {
  brand_id: string;
  brand_name: string;
  mode: string;
  pending_actions: number;
  recent_recommendations: number;
  time_budget: number;
};

export function BrandHealthGrid({ brands }: { brands: BrandStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Brand Health</CardTitle>
      </CardHeader>
      <CardContent>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands configured.</p>
        ) : (
          <div className="space-y-3">
            {brands.map((brand) => (
              <Link
                key={brand.brand_id}
                href={`/brands/${brand.brand_id}/inbox`}
                className="block rounded-md border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{brand.brand_name}</span>
                  <Badge variant={brand.mode === 'assist' ? 'default' : 'secondary'} className="text-xs">
                    {brand.mode}
                  </Badge>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span>{brand.recent_recommendations} recs (7d)</span>
                  <span>{brand.pending_actions} pending</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
