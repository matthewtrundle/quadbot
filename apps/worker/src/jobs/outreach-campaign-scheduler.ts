import { db } from '@quadbot/db';
import {
  campaigns,
  campaignLeads,
  outreachAccounts,
  jobs,
} from '@quadbot/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { enqueue } from '../queue.js';
import { getRedis } from '../queue.js';
import { config } from '../config.js';
import { JobType } from '@quadbot/shared';
import { logger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import type { JobContext } from '../registry.js';

/**
 * System-wide scheduler job. Runs every 2 minutes via cron.
 * Finds eligible campaign_leads ready to send and enqueues outreach_send_email jobs.
 */
export async function outreachCampaignScheduler(ctx: JobContext): Promise<void> {
  const { jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'outreach_campaign_scheduler' }, 'Outreach_Campaign_Scheduler starting');

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Query all active campaigns
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));

  if (activeCampaigns.length === 0) {
    logger.debug('No active outreach campaigns');
    return;
  }

  const redis = getRedis(config.REDIS_URL);
  let totalEnqueued = 0;

  for (const campaign of activeCampaigns) {
    try {
      // 2. Reset daily counter if date changed
      if (campaign.sent_today_date !== todayStr) {
        await db
          .update(campaigns)
          .set({ sent_today: 0, sent_today_date: todayStr, updated_at: now })
          .where(eq(campaigns.id, campaign.id));
        campaign.sent_today = 0;
      }

      // 3. Check daily campaign limit
      if (campaign.sent_today >= campaign.daily_send_limit) {
        logger.debug({ campaignId: campaign.id }, 'Campaign daily limit reached');
        continue;
      }

      // 4. Check send window (timezone-aware)
      if (!isWithinSendWindow(campaign, now)) {
        logger.debug({ campaignId: campaign.id }, 'Outside campaign send window');
        continue;
      }

      // 5. Check send day
      const sendDays = (campaign.send_days as number[]) || [1, 2, 3, 4, 5];
      const currentDay = getDayInTimezone(now, campaign.timezone);
      if (!sendDays.includes(currentDay)) {
        logger.debug({ campaignId: campaign.id, currentDay }, 'Not a send day');
        continue;
      }

      // 6. Find eligible campaign_leads
      const eligibleLeads = await db
        .select()
        .from(campaignLeads)
        .where(
          and(
            eq(campaignLeads.campaign_id, campaign.id),
            eq(campaignLeads.status, 'scheduled'),
            lte(campaignLeads.next_send_at, now),
          ),
        )
        .limit(campaign.daily_send_limit - campaign.sent_today);

      if (eligibleLeads.length === 0) continue;

      // 7. Get available accounts for this brand
      const availableAccounts = await db
        .select()
        .from(outreachAccounts)
        .where(
          and(
            eq(outreachAccounts.brand_id, campaign.brand_id),
            eq(outreachAccounts.status, 'active'),
          ),
        );

      if (availableAccounts.length === 0) {
        logger.warn({ campaignId: campaign.id }, 'No active sending accounts');
        continue;
      }

      // Reset account daily counters if needed
      for (const account of availableAccounts) {
        if (account.sent_today_date !== todayStr) {
          await db
            .update(outreachAccounts)
            .set({ sent_today: 0, sent_today_date: todayStr, updated_at: now })
            .where(eq(outreachAccounts.id, account.id));
          account.sent_today = 0;
        }
      }

      // 8. Enqueue send jobs with spacing
      let cumulativeDelayMs = 0;

      for (const cl of eligibleLeads) {
        // Find account with capacity (round-robin by least recently used)
        const account = availableAccounts
          .filter((a) => a.sent_today < a.daily_limit)
          .sort((a, b) => {
            const aTime = a.last_used_at?.getTime() || 0;
            const bTime = b.last_used_at?.getTime() || 0;
            return aTime - bTime;
          })[0];

        if (!account) {
          logger.debug({ campaignId: campaign.id }, 'All accounts at capacity');
          break;
        }

        // Calculate random spacing
        const spacingMs = (campaign.min_spacing_seconds +
          Math.random() * (campaign.max_spacing_seconds - campaign.min_spacing_seconds)) * 1000;
        cumulativeDelayMs += spacingMs;

        // Mark as sending and assign account
        await db
          .update(campaignLeads)
          .set({
            status: 'sending',
            outreach_account_id: cl.outreach_account_id || account.id,
            updated_at: now,
          })
          .where(eq(campaignLeads.id, cl.id));

        // Enqueue send job
        const jobId = randomUUID();
        await db.insert(jobs).values({
          id: jobId,
          brand_id: campaign.brand_id,
          type: JobType.OUTREACH_SEND_EMAIL,
          status: 'queued',
          payload: {
            campaign_lead_id: cl.id,
            campaign_id: campaign.id,
            outreach_account_id: cl.outreach_account_id || account.id,
            delay_ms: cumulativeDelayMs,
          },
        });

        await enqueue(redis, {
          jobId,
          type: JobType.OUTREACH_SEND_EMAIL,
          payload: {
            brand_id: campaign.brand_id,
            campaign_lead_id: cl.id,
            campaign_id: campaign.id,
            outreach_account_id: cl.outreach_account_id || account.id,
            delay_ms: cumulativeDelayMs,
          },
        });

        totalEnqueued++;

        // Update account usage (optimistic)
        account.sent_today++;
        account.last_used_at = now;
      }

      // Update campaign sent counter
      await db
        .update(campaigns)
        .set({
          sent_today: sql`${campaigns.sent_today} + ${eligibleLeads.length}`,
          updated_at: now,
        })
        .where(eq(campaigns.id, campaign.id));
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, 'Error scheduling campaign');
    }
  }

  // 9. Check for campaigns with all leads completed
  for (const campaign of activeCampaigns) {
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaignLeads)
      .where(
        and(
          eq(campaignLeads.campaign_id, campaign.id),
          sql`${campaignLeads.status} NOT IN ('completed', 'bounced', 'unsubscribed', 'error')`,
        ),
      );

    if (remaining[0]?.count === 0) {
      await db
        .update(campaigns)
        .set({ status: 'completed', completed_at: now, updated_at: now })
        .where(eq(campaigns.id, campaign.id));
      logger.info({ campaignId: campaign.id }, 'Campaign completed — all leads processed');
    }
  }

  logger.info({ jobId, brandId, jobType: 'outreach_campaign_scheduler', totalEnqueued, durationMs: Date.now() - startTime }, 'Outreach_Campaign_Scheduler completed');
}

function isWithinSendWindow(
  campaign: { timezone: string; send_window_start: string; send_window_end: string },
  now: Date,
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: campaign.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = campaign.send_window_start.split(':').map(Number);
    const [endH, endM] = campaign.send_window_end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return true; // Default to allowing if timezone parsing fails
  }
}

function getDayInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const dayStr = formatter.format(date);
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return dayMap[dayStr] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}
