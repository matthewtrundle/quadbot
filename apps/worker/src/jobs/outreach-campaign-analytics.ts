import { db } from '@quadbot/db';
import {
  campaigns,
  outreachEmails,
  outreachAccounts,
  metricSnapshots,
} from '@quadbot/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { logger } from '../logger.js';
import type { JobContext } from '../registry.js';

/**
 * Daily analytics job for outreach campaigns.
 * Aggregates email stats, writes metric snapshots, detects anomalies.
 */
export async function outreachCampaignAnalytics(ctx: JobContext): Promise<void> {
  const { brandId, jobId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'outreach_campaign_analytics' }, 'Outreach_Campaign_Analytics starting');

  const now = new Date();

  // 1. Get all campaigns for this brand (or all brands if system-wide)
  const allCampaigns = brandId && brandId !== 'system'
    ? await db.select().from(campaigns).where(eq(campaigns.brand_id, brandId))
    : await db.select().from(campaigns);

  if (allCampaigns.length === 0) {
    logger.debug({ brandId }, 'No campaigns found for analytics');
    return;
  }

  for (const campaign of allCampaigns) {
    try {
      // 2. Aggregate email stats for this campaign
      const stats = await db
        .select({
          total: sql<number>`count(*)`,
          sent: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('sent', 'delivered', 'opened', 'clicked'))`,
          delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
          opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
          clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
          bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
          complained: sql<number>`count(*) filter (where ${outreachEmails.status} = 'complained')`,
          failed: sql<number>`count(*) filter (where ${outreachEmails.status} = 'failed')`,
          total_opens: sql<number>`coalesce(sum(${outreachEmails.open_count}), 0)`,
          total_clicks: sql<number>`coalesce(sum(${outreachEmails.click_count}), 0)`,
        })
        .from(outreachEmails)
        .where(eq(outreachEmails.campaign_id, campaign.id));

      const s = stats[0];
      if (!s || s.total === 0) continue;

      const deliveryRate = s.sent > 0 ? s.delivered / s.sent : 0;
      const openRate = s.delivered > 0 ? s.opened / s.delivered : 0;
      const clickRate = s.delivered > 0 ? s.clicked / s.delivered : 0;
      const bounceRate = s.sent > 0 ? s.bounced / s.sent : 0;
      const complaintRate = s.sent > 0 ? s.complained / s.sent : 0;

      // 3. Write metric snapshots
      const metricsToWrite = [
        { key: 'outreach_sent', value: s.sent },
        { key: 'outreach_delivered', value: s.delivered },
        { key: 'outreach_opened', value: s.opened },
        { key: 'outreach_clicked', value: s.clicked },
        { key: 'outreach_bounced', value: s.bounced },
        { key: 'outreach_delivery_rate', value: deliveryRate },
        { key: 'outreach_open_rate', value: openRate },
        { key: 'outreach_click_rate', value: clickRate },
        { key: 'outreach_bounce_rate', value: bounceRate },
      ];

      for (const metric of metricsToWrite) {
        await db.insert(metricSnapshots).values({
          brand_id: campaign.brand_id,
          source: 'outreach',
          metric_key: metric.key,
          value: metric.value,
          dimensions: { campaign_id: campaign.id, campaign_name: campaign.name },
          captured_at: now,
        });
      }

      logger.info(
        {
          campaignId: campaign.id,
          sent: s.sent,
          delivered: s.delivered,
          opened: s.opened,
          bounced: s.bounced,
          openRate: (openRate * 100).toFixed(1) + '%',
          bounceRate: (bounceRate * 100).toFixed(1) + '%',
        },
        'Campaign analytics snapshot written',
      );
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, 'Error collecting campaign analytics');
    }
  }

  // 4. Auto-pause accounts with high bounce rates
  const accounts = brandId && brandId !== 'system'
    ? await db
        .select()
        .from(outreachAccounts)
        .where(and(eq(outreachAccounts.brand_id, brandId), eq(outreachAccounts.status, 'active')))
    : await db.select().from(outreachAccounts).where(eq(outreachAccounts.status, 'active'));

  for (const account of accounts) {
    if (account.total_sent >= 20) {
      // Only evaluate accounts with enough volume
      const currentBounceRate = account.total_sent > 0
        ? account.total_bounced / account.total_sent
        : 0;

      // Update bounce_rate
      await db
        .update(outreachAccounts)
        .set({ bounce_rate: currentBounceRate, updated_at: now })
        .where(eq(outreachAccounts.id, account.id));

      if (currentBounceRate > 0.05) {
        // Auto-pause accounts exceeding 5% bounce rate
        await db
          .update(outreachAccounts)
          .set({ status: 'paused', updated_at: now })
          .where(eq(outreachAccounts.id, account.id));

        logger.warn(
          {
            accountId: account.id,
            email: account.email,
            bounceRate: (currentBounceRate * 100).toFixed(1) + '%',
          },
          'Auto-paused outreach account due to high bounce rate (>5%)',
        );
      }
    }
  }

  logger.info({ jobId, brandId, jobType: 'outreach_campaign_analytics', campaignCount: allCampaigns.length, durationMs: Date.now() - startTime }, 'Outreach_Campaign_Analytics completed');
}
