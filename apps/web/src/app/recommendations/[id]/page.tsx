import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { recommendations, brands, actionDrafts, outcomes, artifacts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentBriefSection } from '@/components/content-brief-section';
import { McpQuickActions } from '@/components/mcp-quick-actions';
import { ArrowLeft, ChevronDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
};

const riskColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'outline'> = {
  pending: 'outline',
  approved: 'success',
  rejected: 'destructive',
  executed_stub: 'secondary',
  executed: 'default',
};

export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch recommendation with brand name
  const [rec] = await db
    .select({
      id: recommendations.id,
      brand_id: recommendations.brand_id,
      brand_name: brands.name,
      source: recommendations.source,
      priority: recommendations.priority,
      title: recommendations.title,
      body: recommendations.body,
      data: recommendations.data,
      confidence: recommendations.confidence,
      evaluation_score: recommendations.evaluation_score,
      roi_score: recommendations.roi_score,
      effort_estimate: recommendations.effort_estimate,
      strategic_alignment: recommendations.strategic_alignment,
      priority_rank: recommendations.priority_rank,
      base_score: recommendations.base_score,
      claude_delta: recommendations.claude_delta,
      created_at: recommendations.created_at,
    })
    .from(recommendations)
    .innerJoin(brands, eq(recommendations.brand_id, brands.id))
    .where(eq(recommendations.id, id))
    .limit(1);

  if (!rec) notFound();

  // Parallel fetch related data
  const [drafts, outcomeRows, artifactRows] = await Promise.all([
    db.select().from(actionDrafts).where(eq(actionDrafts.recommendation_id, id)),
    db.select().from(outcomes).where(eq(outcomes.recommendation_id, id)),
    db.select().from(artifacts).where(eq(artifacts.recommendation_id, id)),
  ]);

  const contentBrief = artifactRows.find((a) => a.type === 'trend_content_brief');
  const otherArtifacts = artifactRows.filter((a) => a.type !== 'trend_content_brief');

  // Score items for the grid
  const scores = [
    { label: 'Confidence', value: rec.confidence },
    { label: 'ROI', value: rec.roi_score },
    { label: 'Base Score', value: rec.base_score },
    { label: 'Claude Delta', value: rec.claude_delta },
    { label: 'Evaluation', value: rec.evaluation_score },
    { label: 'Strategic Alignment', value: rec.strategic_alignment },
  ];

  // MCP actions
  const mcpActions = [
    {
      label: 'Get Recommendation',
      tool: 'get_recommendation',
      args: { recommendation_id: rec.id },
    },
    ...(contentBrief
      ? [
          {
            label: 'Blog Content Prompt',
            tool: 'get_content_prompt_from_brief',
            args: { recommendation_id: rec.id, platform: 'blog' },
          },
          {
            label: 'Social Content Prompt',
            tool: 'get_content_prompt_from_brief',
            args: { recommendation_id: rec.id, platform: 'social' },
          },
          {
            label: 'Email Content Prompt',
            tool: 'get_content_prompt_from_brief',
            args: { recommendation_id: rec.id, platform: 'email' },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3">
          {rec.priority_rank != null && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/20 text-sm font-bold text-primary">
              {rec.priority_rank}
            </span>
          )}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{rec.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={priorityColors[rec.priority] || 'outline'}>{rec.priority}</Badge>
              <Badge variant="outline">{rec.source}</Badge>
              <Badge variant="secondary">{rec.brand_name}</Badge>
              {rec.effort_estimate && (
                <Badge variant="outline" className="uppercase text-[10px] tracking-wide">
                  {rec.effort_estimate}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(rec.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{rec.body}</p>
        </CardContent>
      </Card>

      {/* Scores Grid */}
      {scores.some((s) => s.value != null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {scores.map(
                (s) =>
                  s.value != null && (
                    <div key={s.label} className="rounded-md border border-border/50 p-3 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {s.label}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {(s.value * 100).toFixed(0)}
                      </p>
                    </div>
                  ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Brief */}
      {contentBrief && (
        <ContentBriefSection brief={contentBrief.content as Record<string, unknown>} />
      )}

      {/* Action Drafts */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action Drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-md border border-border/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{draft.type}</span>
                  <Badge variant={riskColors[draft.risk] || 'outline'} className="text-[10px]">
                    Risk: {draft.risk}
                  </Badge>
                  <Badge variant={statusColors[draft.status] || 'outline'} className="text-[10px]">
                    {draft.status}
                  </Badge>
                </div>
                <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-32">
                  {JSON.stringify(draft.payload, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Outcomes */}
      {outcomeRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outcomeRows.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-border/50 p-3">
                <span className="text-sm font-medium">{o.metric_name}</span>
                <div className="flex items-center gap-3 text-sm tabular-nums">
                  {o.metric_value_before != null && (
                    <span className="text-muted-foreground">{o.metric_value_before.toFixed(2)}</span>
                  )}
                  {o.metric_value_before != null && o.metric_value_after != null && (
                    <span className="text-muted-foreground">&rarr;</span>
                  )}
                  {o.metric_value_after != null && (
                    <span className="font-medium">{o.metric_value_after.toFixed(2)}</span>
                  )}
                  {o.delta != null && (
                    <span
                      className={
                        o.delta > 0
                          ? 'text-success font-medium'
                          : o.delta < 0
                            ? 'text-destructive font-medium'
                            : 'text-muted-foreground'
                      }
                    >
                      {o.delta > 0 ? '+' : ''}
                      {o.delta.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Other Artifacts */}
      {otherArtifacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artifacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {otherArtifacts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border/50 p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  <span className="text-sm">{a.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">v{a.version}</Badge>
                  <span className="text-[10px] text-muted-foreground">{a.status}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* MCP Quick Actions */}
      <McpQuickActions actions={mcpActions} />

      {/* Raw Data */}
      {rec.data && Object.keys(rec.data).length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            Raw Data
          </summary>
          <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-96">
            {JSON.stringify(rec.data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
