import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq, desc, asc, isNotNull, isNull, sql } from 'drizzle-orm';
import { RecommendationList } from '@/components/recommendation-list';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Sort by priority_rank (ascending, lower = higher priority) when available,
  // then by created_at DESC for unranked
  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.brand_id, id))
    .orderBy(
      sql`CASE WHEN ${recommendations.priority_rank} IS NOT NULL THEN 0 ELSE 1 END`,
      asc(recommendations.priority_rank),
      desc(recommendations.created_at),
    );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Inbox</h2>
      <RecommendationList recommendations={recs} />
    </div>
  );
}
