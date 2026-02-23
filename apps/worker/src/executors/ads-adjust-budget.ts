import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { getValidAdsAccessToken } from '../lib/google-ads-api.js';
import { logger } from '../logger.js';

const MAX_BUDGET_CHANGE_PERCENT = 20;

export const adsAdjustBudgetExecutor: Executor = {
  type: 'ads-adjust-budget',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const campaignId = payload.campaign_id as string | undefined;
    const newDailyBudget = payload.new_daily_budget as number | undefined;
    const currentBudget = payload.current_daily_budget as number | undefined;
    const reason = payload.reason as string | undefined;

    if (!campaignId || newDailyBudget == null) {
      return { success: false, error: 'Missing required fields: campaign_id, new_daily_budget' };
    }

    // Safety: reject changes >20% if we know the current budget
    if (currentBudget != null && currentBudget > 0) {
      const changePct = Math.abs((newDailyBudget - currentBudget) / currentBudget) * 100;
      if (changePct > MAX_BUDGET_CHANGE_PERCENT) {
        return {
          success: false,
          error: `Budget change of ${changePct.toFixed(1)}% exceeds maximum allowed ${MAX_BUDGET_CHANGE_PERCENT}%`,
        };
      }
    }

    logger.info({ brandId, actionDraftId, campaignId, newDailyBudget, reason }, 'Adjusting campaign budget');

    const creds = await getValidAdsAccessToken(db, brandId);
    if (!creds) {
      return { success: false, error: 'No valid Google Ads credentials found' };
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) {
      return { success: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' };
    }

    const cleanCustomerId = creds.customerId.replace(/-/g, '');
    const budgetMicros = Math.round(newDailyBudget * 1_000_000);

    try {
      // First, get the campaign's budget resource name
      const queryRes = await fetch(
        `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/googleAds:searchStream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaignId}`,
          }),
        },
      );

      if (!queryRes.ok) {
        const error = await queryRes.text();
        return { success: false, error: `Failed to get campaign budget: ${error}` };
      }

      const queryData = await queryRes.json() as any;
      const results = Array.isArray(queryData) ? queryData.flatMap((b: any) => b.results || []) : queryData.results || [];
      const budgetResourceName = results[0]?.campaign?.campaignBudget;

      if (!budgetResourceName) {
        return { success: false, error: 'Could not find budget resource for campaign' };
      }

      // Mutate the budget
      const response = await fetch(
        `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/campaignBudgets:mutate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operations: [{
              updateMask: 'amount_micros',
              update: {
                resourceName: budgetResourceName,
                amountMicros: String(budgetMicros),
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
          previous_budget: currentBudget,
          new_budget: newDailyBudget,
          budget_micros: budgetMicros,
          reason,
          rollback_data: currentBudget != null
            ? { campaign_id: campaignId, restore_budget: currentBudget }
            : undefined,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
