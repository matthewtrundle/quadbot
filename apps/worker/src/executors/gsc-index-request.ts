/**
 * GSC Index Request Executor
 * Submits URLs to Google Indexing API for (re)indexing
 */

import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { getValidAccessToken, submitUrlToIndexingApi } from '../lib/gsc-api.js';
import { logger } from '../logger.js';

export interface GscIndexRequestPayload {
  url?: string;
  action?: 'URL_UPDATED' | 'URL_DELETED';
}

export const gscIndexRequestExecutor: Executor = {
  type: 'gsc-index-request',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const { url, action } = payload as unknown as GscIndexRequestPayload;

    if (!url) {
      return {
        success: false,
        error: 'Missing required field: url',
      };
    }

    const indexAction = action || 'URL_UPDATED';

    logger.info(
      { brandId, actionDraftId, url, action: indexAction },
      'Executing GSC index request',
    );

    try {
      const accessToken = await getValidAccessToken(db, brandId);
      if (!accessToken) {
        return {
          success: false,
          error: 'No valid GSC credentials found for brand',
        };
      }

      const result = await submitUrlToIndexingApi(accessToken, url, indexAction);

      logger.info(
        { brandId, actionDraftId, url, result },
        'GSC index request completed',
      );

      return {
        success: true,
        result: {
          url,
          action: indexAction,
          urlNotificationMetadata: result.urlNotificationMetadata,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { brandId, actionDraftId, url, error: errorMessage },
        'GSC index request failed',
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
