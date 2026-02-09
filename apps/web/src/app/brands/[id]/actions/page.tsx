import { db } from '@/lib/db';
import { actionDrafts } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import { ActionDraftsList } from '@/components/action-drafts-list';

export const dynamic = 'force-dynamic';

export default async function ActionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const drafts = await db
    .select()
    .from(actionDrafts)
    .where(eq(actionDrafts.brand_id, id))
    .orderBy(desc(actionDrafts.created_at));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Action Drafts</h2>
        {drafts.length > 0 && (
          <p className="text-sm text-muted-foreground">{drafts.length} total</p>
        )}
      </div>
      {drafts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No action drafts. Switch to Assist mode and process a recommendation to generate one.
        </p>
      ) : (
        <ActionDraftsList
          drafts={drafts.map((d) => ({
            ...d,
            payload: (d.payload as Record<string, unknown>) || {},
          }))}
        />
      )}
    </div>
  );
}
