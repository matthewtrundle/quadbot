import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Outcome = {
  id: string;
  metric_name: string;
  delta: number | null;
  rec_title: string;
  brand_name: string;
};

type NewRisk = {
  id: string;
  title: string;
  priority: string;
  source: string;
  brand_name: string;
};

type PendingApproval = {
  id: string;
  type: string;
  risk: string;
  brand_name: string;
  rec_title: string;
};

type Signal = {
  id: string;
  domain: string;
  signal_type: string;
  title: string;
  confidence: number;
};

type Props = {
  wins: Outcome[];
  regressions: Outcome[];
  newRisks: NewRisk[];
  pendingApprovals: PendingApproval[];
  newSignals: Signal[];
};

export function DailyDiffSummary({ wins, regressions, newRisks, pendingApprovals, newSignals }: Props) {
  const hasContent = wins.length + regressions.length + newRisks.length + pendingApprovals.length + newSignals.length > 0;

  if (!hasContent) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No changes since yesterday. Everything is quiet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">What changed across all brands since yesterday</p>

      {wins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-green-600">Biggest Wins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {wins.filter(w => w.delta != null && w.delta > 0).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{w.rec_title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{w.brand_name}</span>
                  </div>
                  <Badge variant="default" className="bg-green-600">
                    +{w.delta?.toFixed(2)} {w.metric_name}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {regressions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-red-600">Regressions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {regressions.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.rec_title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.brand_name}</span>
                  </div>
                  <Badge variant="destructive">
                    {r.delta?.toFixed(2)} {r.metric_name}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {newRisks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-yellow-600">New Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {newRisks.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.brand_name} &middot; {r.source}</span>
                  </div>
                  <Badge variant="destructive">{r.priority}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Approvals ({pendingApprovals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovals.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{a.rec_title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{a.brand_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{a.type}</Badge>
                    <Badge variant={a.risk === 'high' ? 'destructive' : 'secondary'}>
                      {a.risk}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {newSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-blue-600">Signals Discovered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {newSignals.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">[{s.signal_type}]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{s.domain}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
