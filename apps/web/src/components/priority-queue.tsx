import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListOrdered, Inbox } from 'lucide-react';

type PriorityRec = {
  id: string;
  brand_name: string;
  title: string;
  source: string;
  priority: string;
  priority_rank: number | null;
  base_score: number | null;
  roi_score: number | null;
  effort_estimate: string | null;
  confidence: number | null;
  created_at: Date;
};

export function PriorityQueue({ recommendations }: { recommendations: PriorityRec[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Priority Queue</CardTitle>
          {recommendations.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {recommendations.length} items
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">No recommendations yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              AI-generated insights will appear here once processed
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <Link
                href={`/recommendations/${rec.id}`}
                key={rec.id}
                className="group flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-3 transition-all hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 text-xs font-bold text-primary">
                    {rec.priority_rank || i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{rec.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {rec.brand_name} &middot; {rec.source}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {rec.effort_estimate || '?'}
                  </Badge>
                  <Badge
                    variant={
                      rec.priority === 'critical'
                        ? 'destructive'
                        : rec.priority === 'high'
                          ? 'warning'
                          : 'secondary'
                    }
                    className="text-[10px] uppercase tracking-wide"
                  >
                    {rec.priority}
                  </Badge>
                  {rec.roi_score != null && (
                    <span className="text-xs font-medium tabular-nums text-primary">
                      {(rec.roi_score * 100).toFixed(0)}pts
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
