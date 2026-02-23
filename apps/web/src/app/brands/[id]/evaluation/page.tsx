import { db } from '@/lib/db';
import { evaluationRuns, promptPerformance, promptVersions, metricSnapshots, executionRules } from '@quadbot/db';
import { eq, desc, and } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const trendLabels: Record<string, string> = {
  improving: 'Improving',
  degrading: 'Degrading',
  stable: 'Stable',
  insufficient_data: 'Insufficient Data',
};

const trendColors: Record<string, 'success' | 'destructive' | 'secondary' | 'outline'> = {
  improving: 'success',
  degrading: 'destructive',
  stable: 'secondary',
  insufficient_data: 'outline',
};

function computeTrend(runs: { calibration_error: number | null }[]): string {
  if (runs.length < 3) return 'insufficient_data';
  const recent = runs.slice(0, 3);
  const older = runs.slice(3, 6);
  if (older.length === 0) return 'insufficient_data';

  const avgRecent = recent.reduce((s, r) => s + (r.calibration_error || 0), 0) / recent.length;
  const avgOlder = older.reduce((s, r) => s + (r.calibration_error || 0), 0) / older.length;
  const delta = avgRecent - avgOlder;

  if (Math.abs(delta) < 0.02) return 'stable';
  return delta < 0 ? 'improving' : 'degrading';
}

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

  // Source quality data
  const sourceQuality = await db
    .select({
      metric_key: metricSnapshots.metric_key,
      value: metricSnapshots.value,
      dimensions: metricSnapshots.dimensions,
      captured_at: metricSnapshots.captured_at,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        eq(metricSnapshots.source, 'source_quality'),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at))
    .limit(20);

  // Deduplicate by source (keep most recent)
  const sourceMap = new Map<string, typeof sourceQuality[0]>();
  for (const sq of sourceQuality) {
    const source = sq.metric_key.replace('quality_score:', '');
    if (!sourceMap.has(source)) sourceMap.set(source, sq);
  }
  const sourceRankings = Array.from(sourceMap.entries())
    .map(([source, sq]) => ({
      source,
      quality_score: sq.value,
      dimensions: sq.dimensions as Record<string, number>,
    }))
    .sort((a, b) => b.quality_score - a.quality_score);

  // Current execution rules (threshold)
  const [rules] = await db
    .select()
    .from(executionRules)
    .where(eq(executionRules.brand_id, brandId))
    .limit(1);

  const trend = computeTrend(runs);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Evaluation</h2>

      {/* Top Stats Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Acceptance Rate
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
              Calibration Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={trendColors[trend]}>{trendLabels[trend]}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Confidence Threshold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {rules ? `${(rules.min_confidence * 100).toFixed(0)}%` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">
              {rules?.auto_execute ? 'Auto-execute ON' : 'Manual only'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Avg Outcome Delta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg Outcome Delta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${
            runs[0]?.avg_outcome_delta != null && runs[0].avg_outcome_delta > 0
              ? 'text-success'
              : runs[0]?.avg_outcome_delta != null && runs[0].avg_outcome_delta < 0
                ? 'text-destructive'
                : ''
          }`}>
            {runs[0]?.avg_outcome_delta != null
              ? `${runs[0].avg_outcome_delta > 0 ? '+' : ''}${runs[0].avg_outcome_delta.toFixed(2)}`
              : 'N/A'}
          </p>
        </CardContent>
      </Card>

      {/* Source Quality Rankings */}
      {sourceRankings.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">Source Quality Ranking</h3>
          <div className="space-y-2">
            {sourceRankings.map((sq, i) => (
              <Card key={sq.source}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="font-medium">{sq.source.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">
                      Quality: {(sq.quality_score * 100).toFixed(0)}%
                    </Badge>
                    {sq.dimensions && (
                      <>
                        <Badge variant="outline">
                          Accept: {((sq.dimensions.acceptance_rate || 0) * 100).toFixed(0)}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {sq.dimensions.total || 0} recs
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Calibration History */}
      <div>
        <h3 className="mb-3 text-lg font-medium">Evaluation Runs</h3>
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium text-sm">No evaluation runs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Evaluation runs are created automatically after recommendations are reviewed.
            </p>
          </div>
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
                    <Badge variant={
                      run.calibration_error != null && run.calibration_error < 0.05
                        ? 'success'
                        : run.calibration_error != null && run.calibration_error > 0.15
                          ? 'destructive'
                          : 'secondary'
                    }>
                      Calibration: {run.calibration_error != null ? run.calibration_error.toFixed(3) : 'N/A'}
                    </Badge>
                    {run.avg_outcome_delta != null && (
                      <span className={`text-xs font-medium ${
                        run.avg_outcome_delta > 0 ? 'text-success' : run.avg_outcome_delta < 0 ? 'text-destructive' : ''
                      }`}>
                        Delta: {run.avg_outcome_delta > 0 ? '+' : ''}{run.avg_outcome_delta.toFixed(2)}
                      </span>
                    )}
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

      {/* Prompt Performance */}
      <div>
        <h3 className="mb-3 text-lg font-medium">Prompt Performance</h3>
        {performance.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium text-sm">No prompt performance data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Prompt performance data appears after evaluation runs compare prompt versions.
            </p>
          </div>
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
