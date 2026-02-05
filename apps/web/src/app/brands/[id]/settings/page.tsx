import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { SettingsForm } from '@/components/settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (brand.length === 0) notFound();

  const b = brand[0];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>
      <SettingsForm
        brandId={b.id}
        mode={b.mode}
        modulesEnabled={(b.modules_enabled as string[]) || []}
        guardrails={(b.guardrails as Record<string, unknown>) || {}}
      />
    </div>
  );
}
