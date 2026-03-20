'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GbpMetric {
  id: string;
  brand_id: string;
  total_reviews: number;
  average_rating: number | null;
  new_reviews_count: number;
  direction_requests: number | null;
  phone_calls: number | null;
  website_clicks: number | null;
  photo_views: number | null;
  search_impressions: number | null;
  response_rate: number | null;
  captured_at: string;
}

interface GbpReview {
  id: string;
  brand_id: string;
  review_id: string;
  author_name: string | null;
  rating: number;
  text: string | null;
  reply_text: string | null;
  reply_status: string;
  ai_draft_reply: string | null;
  sentiment: string | null;
  published_at: string | null;
  replied_at: string | null;
  created_at: string;
}

interface GbpData {
  latestMetrics: GbpMetric | null;
  reviews: GbpReview[];
  metricsHistory: GbpMetric[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sentimentVariant(sentiment: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (sentiment) {
    case 'positive':
      return 'default';
    case 'neutral':
      return 'secondary';
    case 'negative':
      return 'destructive';
    default:
      return 'outline';
  }
}

function sentimentColor(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'neutral':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'negative':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return '';
  }
}

function replyStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'published':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'skipped':
      return 'outline';
    default:
      return 'outline';
  }
}

function renderStars(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GbpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [data, setData] = useState<GbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingReview, setEditingReview] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/gbp`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: GbpData = await res.json();
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

  const handleUpdateReply = useCallback(
    async (reviewId: string, updates: { reply_status?: string; reply_text?: string }) => {
      try {
        const res = await fetch(`/api/brands/${brandId}/gbp`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewId, ...updates }),
        });
        if (!res.ok) throw new Error('Failed to update');
        setEditingReview(null);
        setEditText('');
        await fetchData();
      } catch {
        // silently fail
      }
    },
    [brandId, fetchData],
  );

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Google Business Profile</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
              <span className="ml-2 text-sm text-muted-foreground">Loading GBP data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = data?.latestMetrics;
  const reviews = data?.reviews ?? [];
  const metricsHistory = (data?.metricsHistory ?? []).map((m) => ({
    date: formatShortDate(m.captured_at),
    rating: m.average_rating,
  }));

  // Calculate sentiment score
  const reviewsWithSentiment = reviews.filter((r) => r.sentiment);
  const sentimentScore =
    reviewsWithSentiment.length > 0
      ? Math.round(
          (reviewsWithSentiment.filter((r) => r.sentiment === 'positive').length / reviewsWithSentiment.length) * 100,
        )
      : null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-xl font-semibold">Google Business Profile</h2>

      {/* Section A: Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {metrics?.average_rating != null ? metrics.average_rating.toFixed(1) : 'N/A'}
            </p>
            {metrics?.average_rating != null && (
              <p className="text-sm text-yellow-500 mt-1">{renderStars(Math.round(metrics.average_rating))}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics?.total_reviews ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {metrics?.response_rate != null ? `${(metrics.response_rate * 100).toFixed(0)}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sentiment Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sentimentScore != null ? `${sentimentScore}%` : 'N/A'}</p>
            <p className="text-xs text-muted-foreground mt-1">positive reviews</p>
          </CardContent>
        </Card>
      </div>

      {/* Section C: Metrics Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Rating Trend</CardTitle>
          <CardDescription>Average rating over time</CardDescription>
        </CardHeader>
        <CardContent>
          {metricsHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <p className="font-medium text-sm">No historical data available</p>
              <p className="text-sm text-muted-foreground mt-1">Rating trends will appear as metrics are collected.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metricsHistory} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" domain={[0, 5]} tickCount={6} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Avg Rating"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section B: Review Management */}
      <div>
        <h3 className="mb-3 text-lg font-medium">Reviews</h3>
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="font-medium text-sm">No reviews yet</p>
            <p className="text-sm text-muted-foreground mt-1">Reviews will appear here once GBP data is synced.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="py-4">
                  <div className="space-y-3">
                    {/* Review Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-sm">{review.author_name ?? 'Anonymous'}</span>
                        <span className="text-yellow-500 text-sm">{renderStars(review.rating)}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {review.sentiment && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sentimentColor(review.sentiment)}`}
                          >
                            {review.sentiment}
                          </span>
                        )}
                        <Badge variant={replyStatusVariant(review.reply_status)}>{review.reply_status}</Badge>
                      </div>
                    </div>

                    {/* Review Text */}
                    {review.text && <p className="text-sm text-muted-foreground">{review.text}</p>}

                    {/* AI Draft Reply */}
                    {review.ai_draft_reply &&
                      review.reply_status !== 'published' &&
                      review.reply_status !== 'skipped' && (
                        <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">AI Draft Reply</p>

                          {editingReview === review.id ? (
                            <>
                              <Textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={3}
                                className="text-sm"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleUpdateReply(review.id, {
                                      reply_text: editText,
                                      reply_status: 'draft',
                                    })
                                  }
                                >
                                  Save Draft
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingReview(null);
                                    setEditText('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm">{review.reply_text || review.ai_draft_reply}</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleUpdateReply(review.id, { reply_status: 'published' })}
                                >
                                  Approve & Send
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingReview(review.id);
                                    setEditText(review.reply_text || review.ai_draft_reply || '');
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUpdateReply(review.id, { reply_status: 'skipped' })}
                                >
                                  Skip
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                    {/* Published Reply */}
                    {review.reply_status === 'published' && review.reply_text && (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Published Reply</p>
                        <p className="text-sm">{review.reply_text}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
