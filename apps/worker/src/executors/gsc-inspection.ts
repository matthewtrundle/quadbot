/**
 * GSC URL Inspection Executor
 * Checks URL inspection status via GSC API
 */

import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { getValidAccessToken, inspectUrl } from '../lib/gsc-api.js';
import { brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

export interface GscInspectionPayload {
  url?: string;
  siteUrl?: string;
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

export const gscInspectionExecutor: Executor = {
  type: 'gsc-inspection',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const { url, siteUrl: providedSiteUrl } = payload as unknown as GscInspectionPayload;

    if (!url) {
      return {
        success: false,
        error: 'Missing required field: url',
      };
    }

    // If siteUrl not provided, try to get it from the brand integration
    let siteUrl: string | undefined = providedSiteUrl;
    if (!siteUrl) {
      siteUrl = (await getSiteUrlFromIntegration(db, brandId)) ?? undefined;
      if (!siteUrl) {
        return {
          success: false,
          error: 'No siteUrl provided and brand integration has no site_url configured',
        };
      }
    }

    logger.info(
      { brandId, actionDraftId, url, siteUrl },
      'Executing GSC URL inspection',
    );

    try {
      const accessToken = await getValidAccessToken(db, brandId);
      if (!accessToken) {
        return {
          success: false,
          error: 'No valid GSC credentials found for brand',
        };
      }

      const result = await inspectUrl(accessToken, url, siteUrl);

      const inspectionResult = result.inspectionResult;
      const indexStatus = inspectionResult?.indexStatusResult;
      const mobileUsability = inspectionResult?.mobileUsabilityResult;
      const richResults = inspectionResult?.richResultsResult;

      logger.info(
        { brandId, actionDraftId, url, verdict: indexStatus?.verdict },
        'GSC URL inspection completed',
      );

      return {
        success: true,
        result: {
          url,
          siteUrl,
          indexing: {
            verdict: indexStatus?.verdict,
            coverageState: indexStatus?.coverageState,
            indexingState: indexStatus?.indexingState,
            robotsTxtState: indexStatus?.robotsTxtState,
            pageFetchState: indexStatus?.pageFetchState,
            lastCrawlTime: indexStatus?.lastCrawlTime,
            googleCanonical: indexStatus?.googleCanonical,
            userCanonical: indexStatus?.userCanonical,
          },
          mobileUsability: {
            verdict: mobileUsability?.verdict,
            issues: mobileUsability?.issues,
          },
          richResults: {
            verdict: richResults?.verdict,
            detectedItems: richResults?.detectedItems,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { brandId, actionDraftId, url, error: errorMessage },
        'GSC URL inspection failed',
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
