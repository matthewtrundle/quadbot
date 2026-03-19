import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { BrandCard } from '@/components/brand-card';
import { CreateBrandForm } from './create-brand-form';
import { Download, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  const allBrands =
    !admin && userBrandId
      ? await db.select().from(brands).where(eq(brands.id, userBrandId)).orderBy(brands.created_at)
      : await db.select().from(brands).orderBy(brands.created_at);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">Brands</h1>
        {allBrands.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {allBrands.length} brand{allBrands.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <CreateBrandForm />

      {allBrands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16 text-center">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Welcome to QuadBot</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Create a brand above to get started, or import your Google Search Console properties for automatic setup.
          </p>
          <Link
            href="/onboarding/gsc-import"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Download className="h-4 w-4" />
            Import from Google Search Console
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allBrands.map((brand) => (
            <BrandCard
              key={brand.id}
              id={brand.id}
              name={brand.name}
              mode={brand.mode}
              modulesEnabled={(brand.modules_enabled as string[]) || []}
              isActive={brand.is_active}
            />
          ))}
        </div>
      )}
    </div>
  );
}
