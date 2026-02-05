import { metricSnapshots, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 3: Metric Snapshot Collector
 * Captures current metric values per brand/source.
 * In v1, simulates metrics. In v2, integrates with real data sources.
 */
export async function metricSnapshotCollector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand[0].modules_enabled || []) as string[];
  const snapshots: Array<{
    brand_id: string;
    source: string;
    metric_key: string;
    value: number;
    dimensions: Record<string, unknown>;
  }> = [];

  // GSC metrics (simulated)
  if (modulesEnabled.includes('gsc_digest')) {
    snapshots.push(
      { brand_id: brandId, source: 'gsc', metric_key: 'avg_ctr', value: 0.03 + Math.random() * 0.02, dimensions: {} },
      { brand_id: brandId, source: 'gsc', metric_key: 'avg_position', value: 15 + Math.random() * 10, dimensions: {} },
      { brand_id: brandId, source: 'gsc', metric_key: 'total_clicks', value: Math.floor(500 + Math.random() * 200), dimensions: {} },
      { brand_id: brandId, source: 'gsc', metric_key: 'total_impressions', value: Math.floor(15000 + Math.random() * 5000), dimensions: {} },
    );
  }

  // Community metrics (simulated)
  if (modulesEnabled.includes('community_moderation')) {
    snapshots.push(
      { brand_id: brandId, source: 'community', metric_key: 'spam_rate', value: Math.random() * 0.05, dimensions: {} },
      { brand_id: brandId, source: 'community', metric_key: 'moderation_queue_size', value: Math.floor(Math.random() * 20), dimensions: {} },
      { brand_id: brandId, source: 'community', metric_key: 'posts_today', value: Math.floor(10 + Math.random() * 50), dimensions: {} },
    );
  }

  // Trend metrics (simulated)
  if (modulesEnabled.includes('trend_scan')) {
    snapshots.push(
      { brand_id: brandId, source: 'trends', metric_key: 'industry_mentions', value: Math.floor(100 + Math.random() * 200), dimensions: {} },
      { brand_id: brandId, source: 'trends', metric_key: 'sentiment_score', value: 0.5 + Math.random() * 0.3, dimensions: {} },
    );
  }

  // Insert all snapshots
  if (snapshots.length > 0) {
    await db.insert(metricSnapshots).values(snapshots);
  }

  logger.info({ jobId, brandId, snapshotCount: snapshots.length }, 'Metric snapshots captured');
}
