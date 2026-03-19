import { redirect } from 'next/navigation';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { BrandNav } from '@/components/brand-nav';
import { ChatProvider } from '@/components/chat/chat-provider';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  const { id } = await params;
  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);

  if (brand.length === 0) notFound();

  const b = brand[0];

  if (!admin && userBrandId && userBrandId !== b.id) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{b.name}</h1>
        <Badge variant={b.mode === 'assist' ? 'default' : 'secondary'}>{b.mode}</Badge>
      </div>

      <BrandNav brandId={id} />

      {children}

      <ChatProvider brandId={b.id} brandName={b.name} />
    </div>
  );
}
