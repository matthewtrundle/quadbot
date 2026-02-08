import { metricSnapshots, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { IntegrationType } from '@quadbot/shared';
import { getValidGa4AccessToken, getGa4Metrics } from '../lib/google-analytics-api.js';
import { getValidAdsAccessToken, getAdsPerformance } from '../lib/google-ads-api.js';
import { getValidAccessToken } from '../lib/gsc-api.js';

/**
 * Metric Snapshot Collector
 * Captures current metric values per brand/source from real APIs.
 * Only collects metrics when valid credentials are available.
 */
export async function metricSnapshotCollector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  const snapshots: Array<{
    brand_id: string;
    source: string;
    metric_key: string;
    value: number;
    dimensions: Record<string, unknown>;
  }> = [];

  // Date range for metrics (last 7 days)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const dateRange = { start: formatDate(startDate), end: formatDate(endDate) };

  // Collect Google Analytics metrics
  const ga4Credentials = await getValidGa4AccessToken(db, brandId);
  if (ga4Credentials) {
    try {
      const metrics = await getGa4Metrics(ga4Credentials.accessToken, ga4Credentials.propertyId, dateRange);
      if (metrics) {
        snapshots.push(
          { brand_id: brandId, source: 'analytics', metric_key: 'sessions', value: metrics.sessions, dimensions: {} },
          { brand_id: brandId, source: 'analytics', metric_key: 'users', value: metrics.users, dimensions: {} },
          { brand_id: brandId, source: 'analytics', metric_key: 'bounce_rate', value: metrics.bounce_rate, dimensions: {} },
          { brand_id: brandId, source: 'analytics', metric_key: 'avg_session_duration', value: metrics.avg_session_duration, dimensions: {} },
        );
        logger.info({ jobId, brandId }, 'Collected Google Analytics metrics');
      }
    } catch (error) {
      logger.error({ jobId, brandId, error }, 'Failed to collect Google Analytics metrics');
    }
  }

  // Collect Google Ads metrics
  const adsCredentials = await getValidAdsAccessToken(db, brandId);
  if (adsCredentials) {
    try {
      const adsData = await getAdsPerformance(adsCredentials.accessToken, adsCredentials.customerId, dateRange);
      if (adsData) {
        snapshots.push(
          { brand_id: brandId, source: 'ads', metric_key: 'total_spend', value: adsData.total_spend, dimensions: {} },
          { brand_id: brandId, source: 'ads', metric_key: 'total_clicks', value: adsData.total_clicks, dimensions: {} },
          { brand_id: brandId, source: 'ads', metric_key: 'total_conversions', value: adsData.total_conversions, dimensions: {} },
          { brand_id: brandId, source: 'ads', metric_key: 'avg_cpc', value: adsData.avg_cpc, dimensions: {} },
          { brand_id: brandId, source: 'ads', metric_key: 'avg_roas', value: adsData.avg_roas, dimensions: {} },
        );
        logger.info({ jobId, brandId }, 'Collected Google Ads metrics');
      }
    } catch (error) {
      logger.error({ jobId, brandId, error }, 'Failed to collect Google Ads metrics');
    }
  }

  // Note: GSC metrics would be collected here if we had a GSC metrics API helper
  // For now, GSC data comes from the gsc-daily-digest job

  // Insert all snapshots
  if (snapshots.length > 0) {
    await db.insert(metricSnapshots).values(snapshots);
    logger.info({ jobId, brandId, snapshotCount: snapshots.length }, 'Metric snapshots captured');
  } else {
    logger.info({ jobId, brandId }, 'No metrics available to capture (no valid credentials)');
  }
}
