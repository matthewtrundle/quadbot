import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, Zap } from 'lucide-react';
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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Brand Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands configured.</p>
        ) : (
          <div className="space-y-2">
            {brands.map((brand) => (
              <Link
                key={brand.brand_id}
                href={`/brands/${brand.brand_id}/inbox`}
                className="group flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-3 transition-all hover:border-primary/30 hover:bg-secondary/50 hover:glow-cyan"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {brand.brand_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${brand.mode === 'assist' ? 'bg-success' : 'bg-warning'}`} />
                      <Badge
                        variant={brand.mode === 'assist' ? 'default' : 'outline'}
                        className="shrink-0 text-[10px] uppercase tracking-wide"
                      >
                        {brand.mode}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-xs">
                    <span className="text-foreground/70">
                      <span className="font-medium text-foreground">{brand.recent_recommendations}</span> recs (7d)
                    </span>
                    <span className="text-foreground/70">
                      <span className="font-medium text-foreground">{brand.pending_actions}</span> pending
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
