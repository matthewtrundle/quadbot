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
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {brands.map((b) => (
            <div key={b.brand_id} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary/40" />
              <span className="text-sm text-foreground/80">{b.brand_name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {estimateMinutes(b.pending_actions)}/{b.time_budget}m
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
