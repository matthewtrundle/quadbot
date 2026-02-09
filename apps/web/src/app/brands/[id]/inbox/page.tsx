import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { RecommendationList } from '@/components/recommendation-list';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let recs;
  try {
    // Sort by priority_rank (ascending, lower = higher priority) when available,
    // then by created_at DESC for unranked. Exclude dropped recs (priority_rank = -1).
    recs = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.brand_id, id))
      .orderBy(
        sql`CASE WHEN ${recommendations.priority_rank} IS NOT NULL AND ${recommendations.priority_rank} > 0 THEN 0 ELSE 1 END`,
        asc(recommendations.priority_rank),
        desc(recommendations.created_at),
      );
  } catch (err) {
    console.error('Inbox page DB query failed:', err);
    recs = [];
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Inbox</h2>
      <RecommendationList recommendations={recs} />
    </div>
  );
}
