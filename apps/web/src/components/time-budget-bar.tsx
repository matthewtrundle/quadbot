import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';

type BrandStat = {
  brand_id: string;
  brand_name: string;
  pending_actions: number;
  time_budget: number;
};

function estimateMinutes(pendingActions: number): number {
  // Estimate 10 minutes per pending approval
  return pendingActions * 10;
}

export function TimeBudgetBar({ brands }: { brands: BrandStat[] }) {
  const totalBudget = brands.reduce((sum, b) => sum + b.time_budget, 0);
  const totalUsed = brands.reduce((sum, b) => sum + estimateMinutes(b.pending_actions), 0);
  const percentage = totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0;

  // Only show brands with pending actions
  const activeBrands = brands.filter((b) => b.pending_actions > 0);
  const inactiveCount = brands.length - activeBrands.length;

  return (
    <Card className={`overflow-hidden ${percentage > 80 ? 'pulse-glow' : ''}`}>
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Daily Time Budget</span>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold tabular-nums">{totalUsed}</span>
            <span className="text-sm text-muted-foreground">/{totalBudget} min</span>
          </div>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage > 80 ? 'bg-destructive' : ''
            }`}
            style={{
              width: `${Math.max(percentage, 2)}%`,
              ...(percentage <= 80 ? { background: 'linear-gradient(90deg, var(--color-quad-cyan), var(--color-quad-purple))' } : {}),
            }}
          />
        </div>
        {activeBrands.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {activeBrands.map((b) => {
              const used = estimateMinutes(b.pending_actions);
              const pct = b.time_budget > 0 ? Math.min(100, (used / b.time_budget) * 100) : 0;
              return (
                <div key={b.brand_id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                    {b.brand_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct > 80 ? 'bg-destructive' : ''
                        }`}
                        style={{
                          width: `${Math.max(pct, 4)}%`,
                          ...(pct <= 80 ? { background: 'linear-gradient(90deg, var(--color-quad-cyan), var(--color-quad-purple))' } : {}),
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                      {used}/{b.time_budget}m
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No pending actions across {brands.length} brands — you&apos;re all caught up.
          </p>
        )}
        {inactiveCount > 0 && activeBrands.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            +{inactiveCount} brand{inactiveCount !== 1 ? 's' : ''} with no pending actions
          </p>
        )}
      </CardContent>
    </Card>
  );
}
