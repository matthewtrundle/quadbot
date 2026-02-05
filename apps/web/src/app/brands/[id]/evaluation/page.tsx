import { db } from '@/lib/db';
import { evaluationRuns, promptPerformance, promptVersions } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const runs = await db
    .select()
    .from(evaluationRuns)
    .where(eq(evaluationRuns.brand_id, brandId))
    .orderBy(desc(evaluationRuns.created_at))
    .limit(10);

  const performance = await db
    .select({
      id: promptPerformance.id,
      prompt_name: promptVersions.name,
      prompt_version: promptVersions.version,
      total_recommendations: promptPerformance.total_recommendations,
      accepted_count: promptPerformance.accepted_count,
      acceptance_rate: promptPerformance.acceptance_rate,
      avg_outcome_delta: promptPerformance.avg_outcome_delta,
      effectiveness_score: promptPerformance.effectiveness_score,
      created_at: promptPerformance.created_at,
    })
    .from(promptPerformance)
    .innerJoin(promptVersions, eq(promptPerformance.prompt_version_id, promptVersions.id))
    .orderBy(desc(promptPerformance.created_at))
    .limit(10);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Evaluation</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Latest Acceptance Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {runs[0]?.acceptance_rate != null
                ? `${(runs[0].acceptance_rate * 100).toFixed(1)}%`
                : 'N/A'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Calibration Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {runs[0]?.calibration_error != null
                ? runs[0].calibration_error.toFixed(3)
                : 'N/A'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Outcome Delta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {runs[0]?.avg_outcome_delta != null
                ? runs[0].avg_outcome_delta.toFixed(2)
                : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-medium">Evaluation Runs</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evaluation runs yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <Card key={run.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">{run.total_recommendations} recs</span>
                    <Badge variant="secondary">
                      Acceptance: {run.acceptance_rate != null ? `${(run.acceptance_rate * 100).toFixed(1)}%` : 'N/A'}
                    </Badge>
                    <Badge variant="secondary">
                      Calibration: {run.calibration_error != null ? run.calibration_error.toFixed(3) : 'N/A'}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-lg font-medium">Prompt Performance</h3>
        {performance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prompt performance data yet.</p>
        ) : (
          <div className="space-y-2">
            {performance.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">{p.prompt_name} v{p.prompt_version}</span>
                    <Badge variant="secondary">
                      {p.total_recommendations} recs
                    </Badge>
                    <Badge variant="secondary">
                      Acceptance: {p.acceptance_rate != null ? `${(p.acceptance_rate * 100).toFixed(1)}%` : 'N/A'}
                    </Badge>
                    <Badge variant={
                      p.effectiveness_score != null && p.effectiveness_score > 0.5
                        ? 'default'
                        : 'secondary'
                    }>
                      Score: {p.effectiveness_score?.toFixed(3) ?? 'N/A'}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
