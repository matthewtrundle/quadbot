import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <CardHeader>
        <CardTitle>Priority Queue</CardTitle>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ranked recommendations yet.</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div
                key={rec.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {rec.priority_rank || i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{rec.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {rec.brand_name} &middot; {rec.source}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {rec.effort_estimate || '?'}
                  </Badge>
                  <Badge
                    variant={
                      rec.priority === 'critical'
                        ? 'destructive'
                        : rec.priority === 'high'
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {rec.priority}
                  </Badge>
                  {rec.roi_score != null && (
                    <span className="text-xs text-muted-foreground">
                      {(rec.roi_score * 100).toFixed(0)}pts
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
