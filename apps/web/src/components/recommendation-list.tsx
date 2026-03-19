'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Recommendation = {
  id: string;
  source: string;
  priority: string;
  title: string;
  body: string;
  created_at: Date;
};

const PAGE_SIZE = 20;

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const uniqueSources = useMemo(
    () => Array.from(new Set(recommendations.map((r) => r.source))).sort(),
    [recommendations],
  );

  const filtered = useMemo(() => {
    let result = recommendations;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
    }
    if (priorityFilter !== 'all') {
      result = result.filter((r) => r.priority === priorityFilter);
    }
    if (sourceFilter !== 'all') {
      result = result.filter((r) => r.source === sourceFilter);
    }
    return result;
  }, [recommendations, searchQuery, priorityFilter, sourceFilter]);

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
            />
          </svg>
        </div>
        <p className="font-medium text-sm">No recommendations yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Recommendations will appear here once QuadBot analyzes your data sources.
        </p>
      </div>
    );
  }

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search recommendations..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="h-9 text-sm sm:max-w-xs"
        />
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All sources</option>
          {uniqueSources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {recommendations.length}
        </span>
      </div>

      {visible.map((rec) => (
        <Link key={rec.id} href={`/recommendations/${rec.id}`} className="block">
          <Card className="hover:border-primary/30 transition-all">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">{rec.title}</CardTitle>
                <div className="flex gap-2 flex-shrink-0">
                  <Badge variant={priorityColors[rec.priority] || 'outline'}>{rec.priority}</Badge>
                  <Badge variant="outline">{rec.source}</Badge>
                </div>
              </div>
              <CardDescription>{new Date(rec.created_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">{rec.body.split('\n\n')[0]}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
            Show more ({filtered.length - visibleCount} remaining)
          </Button>
        </div>
      )}
      {!hasMore && filtered.length > PAGE_SIZE && (
        <p className="text-center text-xs text-muted-foreground">Showing all {filtered.length} recommendations</p>
      )}
    </div>
  );
}
