import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Radio, Signal as SignalIcon } from 'lucide-react';

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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Signal Feed</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <SignalIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">No signals discovered yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-lg border border-border/50 bg-secondary/30 p-3 transition-all hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{signal.title}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
                    {signal.domain}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/70 line-clamp-2">
                  {signal.description}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{signal.signal_type}</span>
                  <span className="flex items-center gap-1 text-primary">
                    <span className="font-medium">{(signal.confidence * 100).toFixed(0)}%</span>
                    <span className="text-muted-foreground">confidence</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
