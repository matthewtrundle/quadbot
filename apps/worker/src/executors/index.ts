export * from './types.js';
export * from './registry.js';
export * from './gsc-index-request.js';
export * from './gsc-inspection.js';
export * from './gsc-sitemap-notify.js';
export * from './flag-for-review.js';
export * from './ads-pause-campaign.js';
export * from './ads-enable-campaign.js';
export * from './ads-adjust-budget.js';
export * from './update-meta.js';
export * from './content-publisher.js';
export * from './social-post.js';

import { registerExecutor } from './registry.js';
import { gscIndexRequestExecutor } from './gsc-index-request.js';
import { gscInspectionExecutor } from './gsc-inspection.js';
import { gscSitemapNotifyExecutor } from './gsc-sitemap-notify.js';
import { flagForReviewExecutor } from './flag-for-review.js';
import { adsPauseCampaignExecutor } from './ads-pause-campaign.js';
import { adsEnableCampaignExecutor } from './ads-enable-campaign.js';
import { adsAdjustBudgetExecutor } from './ads-adjust-budget.js';
import { updateMetaExecutor } from './update-meta.js';
import { contentPublisherExecutor } from './content-publisher.js';
import { socialPostExecutor } from './social-post.js';

/**
 * Register all executors with the registry.
 * Call this during worker initialization.
 */
export function registerAllExecutors(): void {
  registerExecutor(gscIndexRequestExecutor);
  registerExecutor(gscInspectionExecutor);
  registerExecutor(gscSitemapNotifyExecutor);
  registerExecutor(flagForReviewExecutor);
  registerExecutor(adsPauseCampaignExecutor);
  registerExecutor(adsEnableCampaignExecutor);
  registerExecutor(adsAdjustBudgetExecutor);
  registerExecutor(updateMetaExecutor);
  registerExecutor(contentPublisherExecutor);
  registerExecutor(socialPostExecutor);
}
