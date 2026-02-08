import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Recommendation = {
  id: string;
  source: string;
  priority: string;
  title: string;
  body: string;
  created_at: Date;
};

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No recommendations yet.</p>;
  }

  return (
    <div className="space-y-4">
      {recommendations.map((rec) => (
        <Link key={rec.id} href={`/recommendations/${rec.id}`} className="block">
        <Card className="hover:border-primary/30 transition-all">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{rec.title}</CardTitle>
              <div className="flex gap-2">
                <Badge variant={priorityColors[rec.priority] || 'outline'}>{rec.priority}</Badge>
                <Badge variant="outline">{rec.source}</Badge>
              </div>
            </div>
            <CardDescription>{new Date(rec.created_at).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{rec.body}</p>
          </CardContent>
        </Card>
        </Link>
      ))}
    </div>
  );
}
