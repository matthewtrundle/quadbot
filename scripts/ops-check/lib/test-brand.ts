import { db, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';

const TEST_BRAND_PREFIX = '_ops_check_';

export async function createTestBrand(): Promise<{ id: string; name: string }> {
  const name = `${TEST_BRAND_PREFIX}${Date.now()}`;
  const [brand] = await db
    .insert(brands)
    .values({ name, mode: 'observe', is_active: true })
    .returning();
  return { id: brand.id, name: brand.name };
}

export async function cleanupTestBrand(brandId: string): Promise<void> {
  await db.delete(brands).where(eq(brands.id, brandId));
}

export async function cleanupAllTestBrands(): Promise<number> {
  const testBrands = await db.select().from(brands);
  const toDelete = testBrands.filter((b) => b.name.startsWith(TEST_BRAND_PREFIX));

  for (const brand of toDelete) {
    await db.delete(brands).where(eq(brands.id, brand.id));
  }

  return toDelete.length;
}
