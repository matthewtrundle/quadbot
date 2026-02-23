import { db } from '@/lib/db';
import { actionExecutions, actionDrafts, executionBudgets } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'outline'> = {
  success: 'success',
  failed: 'destructive',
  stubbed: 'secondary',
};

export default async function ExecutionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: brandId } = await params;

  // Get all action drafts for this brand that have been executed
  const drafts = await db
    .select()
    .from(actionDrafts)
    .where(
      and(
        eq(actionDrafts.brand_id, brandId),
      ),
    )
    .orderBy(desc(actionDrafts.updated_at))
    .limit(100);

  const executedDraftIds = drafts
    .filter((d) => d.status === 'executed' || d.status === 'executed_stub')
    .map((d) => d.id);

  // Get executions for those drafts
  const executions = executedDraftIds.length > 0
    ? await Promise.all(
        executedDraftIds.map(async (draftId) => {
          const rows = await db
            .select()
            .from(actionExecutions)
            .where(eq(actionExecutions.action_draft_id, draftId))
            .orderBy(desc(actionExecutions.executed_at));
          return rows;
        }),
      ).then((results) => results.flat())
    : [];

  // Build a map of draft_id -> draft for quick lookup
  const draftMap = new Map(drafts.map((d) => [d.id, d]));

  // Sort executions by date
  executions.sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());

  // Compute stats
  const successCount = executions.filter((e) => e.status === 'success').length;
  const failedCount = executions.filter((e) => e.status === 'failed').length;
  const totalCount = executions.length;
  const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : '—';

  // Get today's budget
  const today = new Date().toISOString().slice(0, 10);
  const [todayBudget] = await db
    .select()
    .from(executionBudgets)
    .where(and(eq(executionBudgets.brand_id, brandId), eq(executionBudgets.date, today)))
    .limit(1);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold tabular-nums">{totalCount}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Executions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold tabular-nums text-success">{successCount}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Successful</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold tabular-nums text-destructive">{failedCount}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold tabular-nums">{successRate}%</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Budget */}
      {todayBudget && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Executions</p>
                <p className="text-lg font-bold tabular-nums">{todayBudget.executions_count} / 10</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ads Spend Delta</p>
                <p className="text-lg font-bold tabular-nums">${(todayBudget.spend_delta_cents / 100).toFixed(2)} / $50.00</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution History</CardTitle>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No executions yet</p>
          ) : (
            <div className="space-y-3">
              {executions.map((exec) => {
                const draft = draftMap.get(exec.action_draft_id);
                const result = exec.result as Record<string, unknown> | null;
                return (
                  <div key={exec.id} className="rounded-md border border-border/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusColors[exec.status] || 'outline'} className="text-[10px]">
                          {exec.status}
                        </Badge>
                        <span className="text-sm font-medium">{draft?.type || 'Unknown'}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(exec.executed_at).toLocaleString()}
                      </span>
                    </div>
                    {result && (
                      <div className="mt-2">
                        {result.error ? (
                          <p className="text-xs text-destructive">{String(result.error)}</p>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {result.url ? <span>URL: {String(result.url)} </span> : null}
                            {result.campaign_id ? <span>Campaign: {String(result.campaign_id)} </span> : null}
                            {result.new_status ? <span>Status: {String(result.new_status)} </span> : null}
                            {result.new_budget != null ? <span>Budget: ${String(result.new_budget)} </span> : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
