import Link from 'next/link';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);

  if (brand.length === 0) notFound();

  const b = brand[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{b.name}</h1>
        <Badge variant={b.mode === 'assist' ? 'default' : 'secondary'}>{b.mode}</Badge>
      </div>

      <nav className="flex gap-4 border-b pb-2">
        <Link href={`/brands/${id}/inbox`} className="text-sm font-medium hover:text-primary">
          Inbox
        </Link>
        <Link href={`/brands/${id}/actions`} className="text-sm font-medium hover:text-primary">
          Actions
        </Link>
        <Link href={`/brands/${id}/artifacts`} className="text-sm font-medium hover:text-primary">
          Artifacts
        </Link>
        <Link href={`/brands/${id}/evaluation`} className="text-sm font-medium hover:text-primary">
          Evaluation
        </Link>
        <Link href={`/brands/${id}/settings`} className="text-sm font-medium hover:text-primary">
          Settings
        </Link>
      </nav>

      {children}
    </div>
  );
}
