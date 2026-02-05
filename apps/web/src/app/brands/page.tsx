import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { BrandCard } from '@/components/brand-card';
import { CreateBrandForm } from './create-brand-form';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const allBrands = await db.select().from(brands).orderBy(brands.created_at);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Brands</h1>
      </div>

      <CreateBrandForm />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {allBrands.map((brand) => (
          <BrandCard
            key={brand.id}
            id={brand.id}
            name={brand.name}
            mode={brand.mode}
            modulesEnabled={(brand.modules_enabled as string[]) || []}
          />
        ))}
        {allBrands.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground">
            No brands yet. Create one above.
          </p>
        )}
      </div>
    </div>
  );
}
