import { Card, CardContent } from '@/components/ui/card';

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
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Time Budget</span>
          <span className="text-muted-foreground">
            {totalUsed}/{totalBudget} min estimated today
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all ${
              percentage > 80 ? 'bg-destructive' : percentage > 50 ? 'bg-yellow-500' : 'bg-primary'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          {brands.map((b) => (
            <span key={b.brand_id}>
              {b.brand_name}: {estimateMinutes(b.pending_actions)}/{b.time_budget}min
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
