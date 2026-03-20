'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SeasonalTopic {
  id: string;
  topic: string;
  category: string | null;
  peak_month: number;
  peak_start_week: number | null;
  peak_end_week: number | null;
  historical_volume: number | null;
  yoy_growth: number | null;
  recommended_publish_weeks_before: number;
  content_suggestions: string[];
  target_keywords: string[];
  competitor_coverage: { domain: string; url?: string; title?: string }[];
  status: string;
  priority_score: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || 'Unknown';
}

function categoryColor(cat: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (cat) {
    case 'holiday':
      return 'destructive';
    case 'seasonal':
      return 'default';
    case 'industry_event':
      return 'secondary';
    case 'trending':
      return 'outline';
    default:
      return 'outline';
  }
}

function priorityLabel(score: number | null): { text: string; color: string } {
  if (!score) return { text: 'Unknown', color: 'text-muted-foreground' };
  if (score >= 80) return { text: 'High', color: 'text-red-600' };
  if (score >= 50) return { text: 'Medium', color: 'text-yellow-600' };
  return { text: 'Low', color: 'text-green-600' };
}

function statusLabel(status: string): { text: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  switch (status) {
    case 'published':
      return { text: 'Published', variant: 'default' };
    case 'in_progress':
      return { text: 'In Progress', variant: 'secondary' };
    case 'skipped':
      return { text: 'Skipped', variant: 'outline' };
    case 'upcoming':
      return { text: 'Upcoming', variant: 'outline' };
    default:
      return { text: status, variant: 'outline' };
  }
}

function getUpcomingMonths(count: number): number[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const months: number[] = [];
  for (let i = 0; i < count; i++) {
    months.push(((currentMonth - 1 + i) % 12) + 1);
  }
  return months;
}

function isWithinNMonths(peakMonth: number, n: number): boolean {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    if (((currentMonth - 1 + i) % 12) + 1 === peakMonth) return true;
  }
  return false;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeasonalContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [topics, setTopics] = useState<SeasonalTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/seasonal`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setTopics(Array.isArray(json) ? json : (json.topics ?? []));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // ─── Status Update ─────────────────────────────────────────────────────────

  const updateStatus = useCallback(
    async (topicId: string, newStatus: string) => {
      setUpdatingIds((prev) => new Set(prev).add(topicId));
      try {
        const res = await fetch(`/api/brands/${brandId}/seasonal`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId, status: newStatus }),
        });
        if (!res.ok) throw new Error('Failed to update');
        setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, status: newStatus } : t)));
      } catch {
        // silently fail
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(topicId);
          return next;
        });
      }
    },
    [brandId],
  );

  // ─── Toggle expand ─────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ─── Derived Data ──────────────────────────────────────────────────────────

  const filteredTopics = topics.filter((t) => {
    if (priorityFilter !== 'all') {
      const p = priorityLabel(t.priority_score);
      if (p.text.toLowerCase() !== priorityFilter) return false;
    }
    if (categoryFilter !== 'all') {
      if ((t.category || 'unknown') !== categoryFilter) return false;
    }
    return true;
  });

  const upcomingMonths = getUpcomingMonths(6);

  const topicsByMonth: Record<number, SeasonalTopic[]> = {};
  for (const month of upcomingMonths) {
    topicsByMonth[month] = filteredTopics
      .filter((t) => t.peak_month === month)
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }

  const categories = Array.from(new Set(topics.map((t) => t.category || 'unknown')));
  const upcomingIn3Months = topics.filter((t) => isWithinNMonths(t.peak_month, 3)).length;
  const avgPriority =
    topics.length > 0 ? Math.round(topics.reduce((sum, t) => sum + (t.priority_score ?? 0), 0) / topics.length) : 0;

  // ─── Loading Skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Seasonal Content Planner</h2>
        <Card>
          <CardContent className="py-20">
            <div className="flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading seasonal topics...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Seasonal Content Planner</h2>

      {/* Stats Bar */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Topics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{topics.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming in 3 Months</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{upcomingIn3Months}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Priority Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgPriority}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Priority:</span>
        {(['all', 'high', 'medium', 'low'] as const).map((p) => (
          <Button
            key={p}
            variant={priorityFilter === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPriorityFilter(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </Button>
        ))}

        <span className="ml-4 text-sm font-medium text-muted-foreground">Category:</span>
        <Button
          variant={categoryFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCategoryFilter('all')}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={categoryFilter === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(cat)}
          >
            {cat.replace(/_/g, ' ')}
          </Button>
        ))}
      </div>

      {/* Empty State */}
      {topics.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="font-medium text-sm">No seasonal topics found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Seasonal topics will appear here once discovered by the content planner.
          </p>
        </div>
      )}

      {/* Monthly Timeline */}
      {topics.length > 0 && (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {upcomingMonths.map((month) => {
            const monthTopics = topicsByMonth[month] ?? [];
            const isSoon = isWithinNMonths(month, 2);

            return (
              <Card key={month} className={isSoon ? 'border-primary/50 shadow-sm' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {getMonthName(month)}
                      {isSoon && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Soon
                        </Badge>
                      )}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {monthTopics.length} topic{monthTopics.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {monthTopics.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No topics this month</p>
                  )}

                  {monthTopics.map((topic) => {
                    const priority = priorityLabel(topic.priority_score);
                    const status = statusLabel(topic.status);
                    const isExpanded = expandedIds.has(topic.id);
                    const isUpdating = updatingIds.has(topic.id);

                    return (
                      <div key={topic.id} className="rounded-lg border p-3 space-y-2">
                        {/* Topic Header */}
                        <button
                          onClick={() => toggleExpand(topic.id)}
                          className="flex w-full items-start justify-between text-left gap-2"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="font-medium text-sm leading-tight">{topic.topic}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {topic.category && (
                                <Badge variant={categoryColor(topic.category)} className="text-xs">
                                  {topic.category.replace(/_/g, ' ')}
                                </Badge>
                              )}
                              <Badge variant={status.variant} className="text-xs">
                                {status.text}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className={`text-sm font-bold ${priority.color}`}>
                              {topic.priority_score ?? '--'}
                            </span>
                            <span className={`text-xs ${priority.color}`}>{priority.text}</span>
                          </div>
                        </button>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="space-y-3 border-t pt-3">
                            {/* Peak timing */}
                            <div className="text-xs text-muted-foreground">
                              Peak: {getMonthName(topic.peak_month)}
                              {topic.peak_start_week && topic.peak_end_week && (
                                <span>
                                  {' '}
                                  (weeks {topic.peak_start_week}-{topic.peak_end_week})
                                </span>
                              )}
                              {' | '}Publish {topic.recommended_publish_weeks_before}w before
                            </div>

                            {/* Volume & Growth */}
                            {(topic.historical_volume || topic.yoy_growth) && (
                              <div className="flex gap-4 text-xs">
                                {topic.historical_volume && (
                                  <span className="text-muted-foreground">
                                    Volume: {topic.historical_volume.toLocaleString()}
                                  </span>
                                )}
                                {topic.yoy_growth != null && (
                                  <span className={topic.yoy_growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    YoY: {topic.yoy_growth >= 0 ? '+' : ''}
                                    {topic.yoy_growth.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Target Keywords */}
                            {topic.target_keywords.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1">Target Keywords</p>
                                <div className="flex flex-wrap gap-1">
                                  {topic.target_keywords.map((kw, i) => (
                                    <Badge key={i} variant="outline" className="text-xs font-normal">
                                      {kw}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Content Suggestions */}
                            {topic.content_suggestions.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1">Content Suggestions</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {topic.content_suggestions.map((s, i) => (
                                    <li key={i} className="text-xs text-muted-foreground">
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Competitor Coverage */}
                            {topic.competitor_coverage.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1">Competitor Coverage</p>
                                <div className="space-y-1">
                                  {topic.competitor_coverage.map((c, i) => (
                                    <div key={i} className="text-xs text-muted-foreground">
                                      <span className="font-medium">{c.domain}</span>
                                      {c.title && <span> - {c.title}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Status Actions */}
                            <div className="flex gap-2 pt-1">
                              {topic.status === 'upcoming' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    disabled={isUpdating}
                                    onClick={() => updateStatus(topic.id, 'in_progress')}
                                  >
                                    {isUpdating && (
                                      <span className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    )}
                                    Start
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isUpdating}
                                    onClick={() => updateStatus(topic.id, 'skipped')}
                                  >
                                    Skip
                                  </Button>
                                </>
                              )}
                              {topic.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={isUpdating}
                                  onClick={() => updateStatus(topic.id, 'published')}
                                >
                                  {isUpdating && (
                                    <span className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  )}
                                  Mark Published
                                </Button>
                              )}
                              {(topic.status === 'skipped' || topic.status === 'published') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isUpdating}
                                  onClick={() => updateStatus(topic.id, 'upcoming')}
                                >
                                  Reset to Upcoming
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
