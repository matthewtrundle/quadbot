import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { RecommendationList } from '@/components/recommendation-list';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let recs: (typeof recommendations.$inferSelect)[];
  let error = false;

  try {
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
    error = true;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Inbox</h2>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p>Failed to load recommendations. Please try refreshing the page.</p>
        </div>
      )}
      <RecommendationList recommendations={recs} />
    </div>
  );
}
