/**
 * GSC Sitemap Notify Executor
 * Pings Google to recrawl a sitemap
 */

import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { pingSitemap } from '../lib/gsc-api.js';
import { brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

export interface GscSitemapNotifyPayload {
  sitemapUrl?: string;
}

/**
 * Get the GSC site URL from brand integration config
 */
async function getSiteUrlFromIntegration(
  db: ExecutorContext['db'],
  brandId: string,
): Promise<string | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, 'google_search_console'),
      ),
    )
    .limit(1);

  if (!integration) {
    return null;
  }

  const config = integration.config as Record<string, unknown> | null;
  return (config?.siteUrl as string) || (config?.site_url as string) || null;
}

export const gscSitemapNotifyExecutor: Executor = {
  type: 'gsc-sitemap-notify',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    let { sitemapUrl } = payload as unknown as GscSitemapNotifyPayload;

    // If sitemapUrl not provided, construct it from the brand's GSC site URL
    if (!sitemapUrl) {
      const siteUrl = await getSiteUrlFromIntegration(db, brandId);
      if (siteUrl) {
        // Default to /sitemap.xml
        const baseUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
        sitemapUrl = `${baseUrl}/sitemap.xml`;
      } else {
        return {
          success: false,
          error: 'No sitemapUrl provided and brand integration has no site_url configured',
        };
      }
    }

    logger.info(
      { brandId, actionDraftId, sitemapUrl },
      'Executing GSC sitemap notify',
    );

    try {
      const result = await pingSitemap(sitemapUrl);

      if (result.success) {
        logger.info(
          { brandId, actionDraftId, sitemapUrl },
          'GSC sitemap notify completed',
        );

        return {
          success: true,
          result: {
            sitemapUrl,
            pinged: true,
            timestamp: new Date().toISOString(),
          },
        };
      } else {
        return {
          success: false,
          error: 'Google sitemap ping returned non-200 response',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { brandId, actionDraftId, sitemapUrl, error: errorMessage },
        'GSC sitemap notify failed',
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
