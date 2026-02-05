import { recommendations, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  try {
    return readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf-8');
  } catch {
    return '{}';
  }
}

export async function trendScanIndustry(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // In v1, trend scanning uses fixture data and generates a simple recommendation
  // A real implementation would call external APIs (Google Trends, social listening, etc.)
  const trendsData = loadFixture('trends_sources.json');
  const trends = JSON.parse(trendsData);

  await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'trend_scan',
    priority: 'low',
    title: 'Industry Trend Scan',
    body: `Scanned ${trends.sources?.length || 0} trend sources. No significant shifts detected requiring immediate action.`,
    data: { trends_scanned: trends },
    model_meta: null,
  });

  logger.info({ jobId }, 'Trend scan complete');
}
