'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';

type BrandStat = {
  brand_id: string;
  brand_name: string;
  mode: string;
  is_active: boolean;
  pending_actions: number;
  recent_recommendations: number;
  time_budget: number;
};

type ModeFilter = 'assist' | 'observe' | 'all';

export function BrandHealthGrid({ brands }: { brands: BrandStat[] }) {
  const [filter, setFilter] = useState<ModeFilter>('assist');

  const activeBrands = brands.filter((b) => b.is_active);
  const filtered = filter === 'all'
    ? activeBrands
    : activeBrands.filter((b) => b.mode === filter);

  const assistCount = activeBrands.filter((b) => b.mode === 'assist').length;
  const observeCount = activeBrands.filter((b) => b.mode === 'observe').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Brand Health</CardTitle>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ModeFilter)}
            className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="assist">Assist ({assistCount})</option>
            <option value="observe">Observe ({observeCount})</option>
            <option value="all">All ({activeBrands.length})</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {filter === 'all' ? 'active' : filter}-mode brands.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((brand) => (
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
                    {filter === 'all' && (
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${brand.mode === 'assist' ? 'bg-success' : 'bg-warning'}`} />
                        <Badge
                          variant={brand.mode === 'assist' ? 'default' : 'outline'}
                          className="shrink-0 text-[10px] uppercase tracking-wide"
                        >
                          {brand.mode}
                        </Badge>
                      </div>
                    )}
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
