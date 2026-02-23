import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { BrandNav } from '@/components/brand-nav';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const { id } = await params;
  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);

  if (brand.length === 0) notFound();

  const b = brand[0];

  if (!admin && userBrandId && userBrandId !== b.id) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{b.name}</h1>
        <Badge variant={b.mode === 'assist' ? 'default' : 'secondary'}>{b.mode}</Badge>
      </div>

      <BrandNav brandId={id} />

      {children}
    </div>
  );
}
