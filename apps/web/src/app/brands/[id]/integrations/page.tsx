import { db } from '@/lib/db';
import { brands, brandIntegrations, webhooks } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { IntegrationHub } from './integration-hub';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (brand.length === 0) notFound();

  const b = brand[0];

  const [integrationsList, webhooksList] = await Promise.all([
    db
      .select({
        id: brandIntegrations.id,
        type: brandIntegrations.type,
        config: brandIntegrations.config,
        created_at: brandIntegrations.created_at,
      })
      .from(brandIntegrations)
      .where(eq(brandIntegrations.brand_id, id)),
    db
      .select({
        id: webhooks.id,
        url: webhooks.url,
        event_types: webhooks.event_types,
        is_active: webhooks.is_active,
        failure_count: webhooks.failure_count,
        last_triggered_at: webhooks.last_triggered_at,
        created_at: webhooks.created_at,
      })
      .from(webhooks)
      .where(eq(webhooks.brand_id, id)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect QuadBot to your tools</p>
      </div>

      <IntegrationHub
        brandId={b.id}
        integrations={integrationsList.map((i) => ({
          id: i.id,
          type: i.type,
          config: (i.config as Record<string, unknown>) || {},
          created_at: i.created_at.toISOString(),
        }))}
        webhooks={webhooksList.map((w) => ({
          id: w.id,
          url: w.url,
          event_types: (w.event_types as string[]) || [],
          is_active: w.is_active,
          failure_count: w.failure_count,
          last_triggered_at: w.last_triggered_at?.toISOString() ?? null,
          created_at: w.created_at.toISOString(),
        }))}
      />
    </div>
  );
}
