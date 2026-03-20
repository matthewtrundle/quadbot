'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentGap {
  id: string;
  brand_id: string;
  topic: string;
  competitor_url: string | null;
  competitor_domain: string | null;
  estimated_volume: number | null;
  difficulty: string | null;
  opportunity_score: number;
  status: string;
  brief_artifact_id: string | null;
  detected_at: string;
}

interface GapData {
  gaps: ContentGap[];
  counts: {
    total: number;
    open: number;
    planned: number;
    created: number;
    dismissed: number;
    highValue: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score > 80) return 'default';
  if (score > 50) return 'secondary';
  return 'destructive';
}

function scoreBgClass(score: number): string {
  if (score > 80) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (score > 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'open':
      return 'outline';
    case 'planned':
      return 'secondary';
    case 'created':
      return 'default';
    case 'dismissed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function difficultyVariant(difficulty: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (difficulty) {
    case 'easy':
      return 'default';
    case 'medium':
      return 'secondary';
    case 'hard':
      return 'destructive';
    default:
      return 'outline';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContentGapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [data, setData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/content-gaps`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: GapData = await res.json();
      setData(json);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  const handleAnalyzeGaps = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'content_gap_analyzer', brandId }),
      });
      if (!res.ok) throw new Error('Failed to trigger');
      setTimeout(() => fetchData(), 2000);
    } catch {
      // silently fail
    } finally {
      setAnalyzing(false);
    }
  }, [brandId, fetchData]);

  const handleUpdateStatus = useCallback(
    async (gapId: string, status: string) => {
      try {
        const res = await fetch(`/api/brands/${brandId}/content-gaps`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: gapId, status }),
        });
        if (!res.ok) throw new Error('Failed to update');
        await fetchData();
      } catch {
        // silently fail
      }
    },
    [brandId, fetchData],
  );

  const handleCreateBrief = useCallback(
    async (gapId: string) => {
      await handleUpdateStatus(gapId, 'planned');
    },
    [handleUpdateStatus],
  );

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Content Gap Analysis</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-20">
            <div className="flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading content gaps...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const counts = data?.counts ?? { total: 0, open: 0, planned: 0, created: 0, dismissed: 0, highValue: 0 };
  const gaps = data?.gaps ?? [];

  const filteredGaps = activeTab === 'all' ? gaps : gaps.filter((g) => g.status === activeTab);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Content Gap Analysis</h2>
        <Button variant="outline" size="sm" onClick={handleAnalyzeGaps} disabled={analyzing}>
          {analyzing && (
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          Analyze Gaps
        </Button>
      </div>

      {/* Section A: Summary Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gaps Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{counts.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">High-Value Gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{counts.highValue}</p>
            <p className="text-xs text-muted-foreground mt-1">opportunity score &gt; 70</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gaps Addressed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{counts.planned + counts.created}</p>
            <p className="text-xs text-muted-foreground mt-1">planned or content created</p>
          </CardContent>
        </Card>
      </div>

      {/* Section B: Gap List with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="planned">Planned ({counts.planned})</TabsTrigger>
          <TabsTrigger value="created">Created ({counts.created})</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed ({counts.dismissed})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredGaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No content gaps found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === 'all'
                  ? 'Run a gap analysis to discover content opportunities.'
                  : `No gaps with status "${activeTab}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGaps.map((gap) => (
                <Card key={gap.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-base">{gap.topic}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${scoreBgClass(gap.opportunity_score)}`}
                          >
                            Score: {Math.round(gap.opportunity_score)}
                          </span>
                          <Badge variant={statusVariant(gap.status)}>{gap.status}</Badge>
                        </div>

                        {gap.competitor_domain && (
                          <div className="text-sm text-muted-foreground">
                            Competitor: <span className="font-medium text-foreground">{gap.competitor_domain}</span>
                            {gap.competitor_url && (
                              <a
                                href={gap.competitor_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-primary hover:underline"
                              >
                                View
                              </a>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-3 flex-wrap">
                          {gap.estimated_volume != null && (
                            <span className="text-xs text-muted-foreground">
                              Est. Volume:{' '}
                              <span className="font-medium text-foreground">
                                {gap.estimated_volume.toLocaleString()}
                              </span>
                            </span>
                          )}
                          {gap.difficulty && (
                            <Badge variant={difficultyVariant(gap.difficulty)} className="text-xs">
                              {gap.difficulty}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">Detected {formatDate(gap.detected_at)}</span>
                        </div>
                      </div>

                      {gap.status === 'open' && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="default" onClick={() => handleCreateBrief(gap.id)}>
                            Create Brief
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(gap.id, 'dismissed')}>
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
