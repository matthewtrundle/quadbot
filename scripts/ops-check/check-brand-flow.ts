import { pass, fail } from './lib/helpers.js';
import { apiGet, apiPost } from './lib/api-client.js';
import { cleanupTestBrand } from './lib/test-brand.js';

export async function checkBrandFlow() {
  const brandName = `_ops_check_${Date.now()}`;
  let brandId: string | null = null;

  try {
    // 1. Create brand via API
    const createRes = await apiPost('/api/brands', { name: brandName });
    if (createRes.ok && createRes.data?.id) {
      brandId = createRes.data.id;
      pass('Brand Flow', 'Create brand via API');
    } else {
      fail('Brand Flow', 'Create brand via API', JSON.stringify(createRes.data));
      return;
    }

    // 2. Verify brand appears in list
    const listRes = await apiGet('/api/brands');
    if (listRes.ok) {
      const found = Array.isArray(listRes.data)
        ? listRes.data.some((b: any) => b.id === brandId)
        : (listRes.data as any)?.brands?.some?.((b: any) => b.id === brandId);
      if (found) {
        pass('Brand Flow', 'Brand appears in list');
      } else {
        fail('Brand Flow', 'Brand appears in list', 'Not found in response');
      }
    } else {
      fail('Brand Flow', 'Brand appears in list', `HTTP ${listRes.status}`);
    }

    // 3. Verify brand appears in health dashboard
    try {
      const healthRes = await apiGet('/api/dashboard/health');
      if (healthRes.ok) {
        pass('Brand Flow', 'Health dashboard accessible');
      } else {
        fail('Brand Flow', 'Health dashboard accessible', `HTTP ${healthRes.status}`);
      }
    } catch (err: any) {
      fail('Brand Flow', 'Health dashboard accessible', err.message);
    }
  } finally {
    // Cleanup
    if (brandId) {
      try {
        await cleanupTestBrand(brandId);
      } catch {}
    }
  }
}
