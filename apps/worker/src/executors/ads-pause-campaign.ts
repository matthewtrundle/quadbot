import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { getValidAdsAccessToken } from '../lib/google-ads-api.js';
import { logger } from '../logger.js';

export const adsPauseCampaignExecutor: Executor = {
  type: 'ads-pause-campaign',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const campaignId = payload.campaign_id as string | undefined;
    const reason = payload.reason as string | undefined;

    if (!campaignId) {
      return { success: false, error: 'Missing required field: campaign_id' };
    }

    logger.info({ brandId, actionDraftId, campaignId, reason }, 'Pausing campaign');

    const creds = await getValidAdsAccessToken(db, brandId);
    if (!creds) {
      return { success: false, error: 'No valid Google Ads credentials found' };
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) {
      return { success: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' };
    }

    const cleanCustomerId = creds.customerId.replace(/-/g, '');

    try {
      const response = await fetch(
        `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/campaigns:mutate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operations: [{
              updateMask: 'status',
              update: {
                resourceName: `customers/${cleanCustomerId}/campaigns/${campaignId}`,
                status: 'PAUSED',
              },
            }],
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Google Ads API error: ${error}` };
      }

      return {
        success: true,
        result: {
          campaign_id: campaignId,
          previous_status: 'ENABLED',
          new_status: 'PAUSED',
          reason,
          rollback_data: { campaign_id: campaignId, restore_status: 'ENABLED' },
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
