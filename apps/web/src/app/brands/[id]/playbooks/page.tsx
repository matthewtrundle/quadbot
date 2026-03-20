import { db } from '@/lib/db';
import { playbooks } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PlaybookActions } from '@/components/playbooks/playbook-actions';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const allPlaybooks = await db
    .select()
    .from(playbooks)
    .where(eq(playbooks.brand_id, brandId))
    .orderBy(desc(playbooks.created_at));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Playbooks</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {allPlaybooks.length} playbook{allPlaybooks.length !== 1 ? 's' : ''}
          </span>
          <Link
            href={`/brands/${brandId}/playbooks/marketplace`}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 border border-border bg-transparent hover:bg-secondary hover:border-primary/50 transition-all duration-200"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>

      {allPlaybooks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No playbooks yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Playbooks automate responses to recurring recommendation patterns.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allPlaybooks.map((pb) => {
            const conditions = pb.trigger_conditions as Record<string, unknown>;
            const actions = pb.actions as { type?: string; description?: string }[];

            return (
              <Card key={pb.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{pb.name}</h3>
                        <Badge variant={pb.is_active ? 'default' : 'secondary'}>
                          {pb.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {pb.trigger_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Triggered {pb.run_count} time{pb.run_count !== 1 ? 's' : ''}
                        {pb.last_run_at ? ` — last: ${new Date(pb.last_run_at).toLocaleDateString()}` : ''}
                      </p>
                      {Array.isArray(conditions.sources) && (
                        <p className="text-xs text-muted-foreground">
                          Sources: {(conditions.sources as string[]).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {actions.length} action{actions.length !== 1 ? 's' : ''}
                        </p>
                        {actions.map((a, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] ml-1">
                            {a.type || a.description || 'action'}
                          </Badge>
                        ))}
                      </div>
                      <PlaybookActions
                        playbook={{
                          id: pb.id,
                          name: pb.name,
                          trigger_type: pb.trigger_type,
                          trigger_conditions: pb.trigger_conditions,
                          actions: pb.actions,
                        }}
                        brandId={brandId}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
