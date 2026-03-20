import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { geoVisibilityScores } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all scores from last 30 days
  const scores = await db
    .select()
    .from(geoVisibilityScores)
    .where(and(eq(geoVisibilityScores.brand_id, brandId), gte(geoVisibilityScores.checked_at, thirtyDaysAgo)))
    .orderBy(desc(geoVisibilityScores.checked_at));

  // Summary
  const totalChecks = scores.length;
  const mentionedCount = scores.filter((s) => s.is_mentioned).length;
  const citedCount = scores.filter((s) => s.is_cited).length;
  const mentionedWithPosition = scores.filter((s) => s.is_mentioned && s.position != null);
  const avgPosition =
    mentionedWithPosition.length > 0
      ? mentionedWithPosition.reduce((sum, s) => sum + (s.position ?? 0), 0) / mentionedWithPosition.length
      : null;

  const summary = {
    visibilityRate: totalChecks > 0 ? mentionedCount / totalChecks : 0,
    citationRate: totalChecks > 0 ? citedCount / totalChecks : 0,
    avgPosition,
    totalChecks,
  };

  // By platform
  const platformMap = new Map<string, { mentioned: number; cited: number; positions: number[]; total: number }>();
  for (const score of scores) {
    const existing = platformMap.get(score.platform) ?? { mentioned: 0, cited: 0, positions: [], total: 0 };
    existing.total++;
    if (score.is_mentioned) existing.mentioned++;
    if (score.is_cited) existing.cited++;
    if (score.position != null) existing.positions.push(score.position);
    platformMap.set(score.platform, existing);
  }

  const byPlatform = Array.from(platformMap.entries()).map(([platform, data]) => ({
    platform,
    mentionRate: data.total > 0 ? data.mentioned / data.total : 0,
    citationRate: data.total > 0 ? data.cited / data.total : 0,
    avgPosition: data.positions.length > 0 ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length : null,
    count: data.total,
  }));

  // Competitor comparison
  const competitorCounts = new Map<string, number>();
  for (const score of scores) {
    const competitors = (score.competitor_mentions ?? []) as string[];
    for (const c of competitors) {
      competitorCounts.set(c, (competitorCounts.get(c) ?? 0) + 1);
    }
  }
  const competitorComparison = Array.from(competitorCounts.entries())
    .map(([name, mentionCount]) => ({ name, mentionCount }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 5);

  return NextResponse.json({
    summary,
    byPlatform,
    recentScores: scores.slice(0, 50),
    competitorComparison,
  });
}
