import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Signal = {
  id: string;
  domain: string;
  signal_type: string;
  title: string;
  description: string;
  confidence: number;
  created_at: Date;
};

export function SignalFeed({ signals }: { signals: Signal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent Signals</CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signals discovered yet.</p>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <div key={signal.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{signal.title}</span>
                  <Badge variant="secondary" className="text-xs">
                    {signal.domain}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {signal.description}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{signal.signal_type}</span>
                  <span>&middot;</span>
                  <span>Confidence: {(signal.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
