import { db } from '@/lib/db';
import { leadLists, leads } from '@quadbot/db';
import { eq, desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const lists = await db.select().from(leadLists).where(eq(leadLists.brand_id, id)).orderBy(desc(leadLists.created_at));

  const [leadCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(eq(leads.brand_id, id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{leadCount.count} total leads across {lists.length} lists</p>
        <Link href={`/brands/${id}/outreach/leads/upload`}>
          <Button size="sm">Upload CSV</Button>
        </Link>
      </div>

      {lists.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No lead lists yet. Upload a CSV to get started.
        </p>
      ) : (
        <div className="grid gap-3">
          {lists.map((list) => (
            <Link key={list.id} href={`/brands/${id}/outreach/leads/${list.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{list.name}</p>
                      <p className="text-sm text-muted-foreground">{list.original_filename}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{list.imported_count || 0} imported</p>
                      {(list.duplicate_count || 0) > 0 && <p>{list.duplicate_count} duplicates</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
