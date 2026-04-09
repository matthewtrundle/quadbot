/**
 * Google Business Profile (GBP) Monitor Job
 *
 * Monitors GBP reviews, generates AI reply drafts, and tracks GBP metrics.
 *
 * Mode A: With GBP API integration configured — fetches reviews and metrics from Google.
 * Mode B: Without GBP API — processes existing reviews that need AI draft replies.
 *
 * Triggered: Daily (configured in cron.ts)
 */

import { brands, brandIntegrations, gbpMetrics, gbpReviews, metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and, isNull } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { trackDirectApiCall } from '../claude.js';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

type GbpIntegrationConfig = {
  access_token: string;
  refresh_token: string;
  account_id: string;
  location_id: string;
};

type GoogleReview = {
  reviewId: string;
  reviewer: { displayName: string };
  starRating: string; // 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string; updateTime: string };
};

type GoogleReviewsResponse = {
  reviews?: GoogleReview[];
  totalReviewCount?: number;
  averageRating?: number;
  nextPageToken?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function starRatingToNumber(starRating: string): number {
  return STAR_RATING_MAP[starRating] || 3;
}

function determineSentiment(rating: number): 'positive' | 'neutral' | 'negative' {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

// ─── GBP API Helpers ────────────────────────────────────────────────────────

async function fetchGbpReviews(config: GbpIntegrationConfig): Promise<GoogleReviewsResponse> {
  const url = `https://mybusiness.googleapis.com/v4/accounts/${config.account_id}/locations/${config.location_id}/reviews`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GBP API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<GoogleReviewsResponse>;
}

// ─── AI Reply Generation ────────────────────────────────────────────────────

async function generateAiReplyDraft(
  brandName: string,
  industry: string,
  review: { author_name: string | null; rating: number; text: string | null },
  trackCtx?: { db: import('@quadbot/db').Database; brandId: string; jobId: string },
): Promise<string> {
  const anthropic = new Anthropic();

  const callStart = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-haiku-3-5-20241022',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are a business owner responding to a Google review. Write a professional, warm reply.

Business: ${brandName} (${industry})
Reviewer: ${review.author_name || 'A customer'}
Rating: ${review.rating}/5 stars
Review: ${review.text || '(No text provided)'}

Guidelines:
- Thank them for the review
- If negative (1-3 stars): acknowledge concerns, offer to make it right, invite them to contact you
- If positive (4-5 stars): express gratitude, reinforce what they enjoyed
- Keep it under 150 words
- Be genuine, not corporate
- Never be defensive`,
      },
    ],
  });

  if (trackCtx) trackDirectApiCall(response, trackCtx, callStart);

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || 'Thank you for your review! We appreciate your feedback.';
}

// ─── Main Job ───────────────────────────────────────────────────────────────

export async function gbpMonitor(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'gbp_monitor' }, 'GBP_Monitor starting');

  // 1. Load brand and check module enablement
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('gbp_monitor')) {
    logger.info({ jobId, brandId }, 'gbp_monitor module not enabled, skipping');
    return;
  }

  const brandName = brand.name;
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const industry = (guardrails.industry as string) || 'business';

  // 2. Check for GBP integration
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_business_profile')))
    .limit(1);

  let newReviewCount = 0;

  if (integration) {
    // ── Mode A: Fetch from GBP API ──────────────────────────────────────
    const config = integration.config as unknown as GbpIntegrationConfig;

    if (!config?.access_token || !config?.account_id || !config?.location_id) {
      logger.warn({ jobId, brandId }, 'GBP integration config incomplete, skipping API fetch');
    } else {
      try {
        logger.info({ jobId, brandId }, 'Fetching reviews from GBP API');
        const reviewsResponse = await fetchGbpReviews(config);

        if (reviewsResponse.reviews && reviewsResponse.reviews.length > 0) {
          for (const googleReview of reviewsResponse.reviews) {
            const rating = starRatingToNumber(googleReview.starRating);
            const sentiment = determineSentiment(rating);

            // Upsert review — skip if already exists (unique on brand_id + review_id)
            try {
              await db.insert(gbpReviews).values({
                brand_id: brandId,
                review_id: googleReview.reviewId,
                author_name: googleReview.reviewer?.displayName || null,
                rating,
                text: googleReview.comment || null,
                reply_text: googleReview.reviewReply?.comment || null,
                reply_status: googleReview.reviewReply ? 'published' : 'pending',
                sentiment,
                published_at: new Date(googleReview.createTime),
                replied_at: googleReview.reviewReply ? new Date(googleReview.reviewReply.updateTime) : null,
              });

              newReviewCount++;

              // Emit event for new review
              await emitEvent(
                EventType.GBP_REVIEW_RECEIVED,
                brandId,
                {
                  review_id: googleReview.reviewId,
                  rating,
                  sentiment,
                  author_name: googleReview.reviewer?.displayName || null,
                },
                `gbp:review:${googleReview.reviewId}`,
                'gbp_monitor',
              );
            } catch (err) {
              // Unique constraint violation = review already exists, skip
              if ((err as { code?: string })?.code === '23505') {
                logger.debug({ jobId, reviewId: googleReview.reviewId }, 'Review already exists, skipping');
              } else {
                throw err;
              }
            }
          }

          logger.info(
            { jobId, brandId, fetchedReviews: reviewsResponse.reviews.length, newReviews: newReviewCount },
            'GBP reviews synced',
          );
        }

        // Store GBP-level metrics if available
        if (reviewsResponse.totalReviewCount !== undefined || reviewsResponse.averageRating !== undefined) {
          await db.insert(gbpMetrics).values({
            brand_id: brandId,
            total_reviews: reviewsResponse.totalReviewCount || 0,
            average_rating: reviewsResponse.averageRating || null,
            new_reviews_count: newReviewCount,
          });
        }
      } catch (err) {
        logger.error(
          { jobId, brandId, err: (err as Error).message },
          'Failed to fetch from GBP API, continuing with existing reviews',
        );
      }
    }
  } else {
    // ── Mode B: No GBP integration ──────────────────────────────────────
    logger.info({ jobId, brandId }, 'GBP integration not configured, processing existing reviews only');
  }

  // 3. Generate AI draft replies for pending reviews without drafts
  const pendingReviews = await db
    .select()
    .from(gbpReviews)
    .where(
      and(eq(gbpReviews.brand_id, brandId), eq(gbpReviews.reply_status, 'pending'), isNull(gbpReviews.ai_draft_reply)),
    );

  if (pendingReviews.length > 0) {
    logger.info(
      { jobId, brandId, pendingCount: pendingReviews.length },
      'Generating AI draft replies for pending reviews',
    );

    for (const review of pendingReviews) {
      try {
        const draftReply = await generateAiReplyDraft(
          brandName,
          industry,
          {
            author_name: review.author_name,
            rating: review.rating,
            text: review.text,
          },
          { db, brandId, jobId },
        );

        const sentiment = determineSentiment(review.rating);

        await db
          .update(gbpReviews)
          .set({
            ai_draft_reply: draftReply,
            reply_status: 'draft',
            sentiment,
          })
          .where(eq(gbpReviews.id, review.id));

        logger.info({ jobId, reviewId: review.id, rating: review.rating, sentiment }, 'AI draft reply generated');
      } catch (err) {
        logger.error({ jobId, reviewId: review.id, err: (err as Error).message }, 'Failed to generate AI draft reply');
      }
    }
  }

  // 4. Calculate and store metric snapshots
  const allReviews = await db.select().from(gbpReviews).where(eq(gbpReviews.brand_id, brandId));

  if (allReviews.length > 0) {
    const totalReviews = allReviews.length;
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;
    const reviewsWithReplies = allReviews.filter((r) => r.reply_status === 'published' || r.reply_text).length;
    const responseRate = (reviewsWithReplies / totalReviews) * 100;

    const positiveCount = allReviews.filter((r) => r.rating >= 4).length;
    const negativeCount = allReviews.filter((r) => r.rating <= 2).length;
    const sentimentScore = (positiveCount - negativeCount) / totalReviews;

    const now = new Date();

    const metricsToStore = [
      { metric_key: 'gbp_avg_rating', value: avgRating },
      { metric_key: 'gbp_total_reviews', value: totalReviews },
      { metric_key: 'gbp_response_rate', value: responseRate },
      { metric_key: 'gbp_sentiment_score', value: sentimentScore },
    ];

    for (const metric of metricsToStore) {
      await db.insert(metricSnapshots).values({
        brand_id: brandId,
        source: 'gbp',
        metric_key: metric.metric_key,
        value: metric.value,
        captured_at: now,
      });
    }

    logger.info(
      {
        jobId,
        brandId,
        totalReviews,
        avgRating: avgRating.toFixed(2),
        responseRate: responseRate.toFixed(1),
        sentimentScore: sentimentScore.toFixed(2),
      },
      'GBP metric snapshots stored',
    );

    // 5. Generate recommendations based on issues detected

    // Check for new negative reviews (1-2 stars) that are pending
    const newNegativeReviews = allReviews.filter((r) => r.rating <= 2 && r.reply_status === 'pending');

    if (newNegativeReviews.length > 0) {
      const [rec] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'gbp_monitor',
          priority: 'high',
          title: `${newNegativeReviews.length} negative review${newNegativeReviews.length > 1 ? 's' : ''} need${newNegativeReviews.length === 1 ? 's' : ''} a response`,
          body: `You have ${newNegativeReviews.length} negative review${newNegativeReviews.length > 1 ? 's' : ''} (1-2 stars) without a reply. Responding promptly to negative reviews can improve customer perception and shows you care about feedback. AI draft replies have been generated for your review.`,
          data: {
            negative_review_count: newNegativeReviews.length,
            review_ids: newNegativeReviews.map((r) => r.id),
          },
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'gbp_monitor', priority: 'high' },
        `gbp:neg-reviews:${new Date().toISOString().slice(0, 10)}`,
        'gbp_monitor',
      );
    }

    // Check if response rate is below 50%
    if (responseRate < 50 && totalReviews >= 3) {
      const [rec] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'gbp_monitor',
          priority: 'medium',
          title: 'Improve your Google review response rate',
          body: `Your current review response rate is ${responseRate.toFixed(0)}%. Responding to at least 50% of reviews signals to potential customers that you value feedback. You have ${totalReviews - reviewsWithReplies} reviews awaiting a response. AI draft replies are available to help you respond faster.`,
          data: {
            response_rate: responseRate,
            unanswered_count: totalReviews - reviewsWithReplies,
          },
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'gbp_monitor', priority: 'medium' },
        `gbp:response-rate:${new Date().toISOString().slice(0, 10)}`,
        'gbp_monitor',
      );
    }

    // Check if average rating is below 3.5
    if (avgRating < 3.5 && totalReviews >= 5) {
      const [rec] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'gbp_monitor',
          priority: 'medium',
          title: 'Average Google rating needs attention',
          body: `Your average Google rating is ${avgRating.toFixed(1)} stars across ${totalReviews} reviews. Consider addressing common complaints in negative reviews and encouraging satisfied customers to leave reviews. Responding thoughtfully to negative reviews can also improve perception.`,
          data: {
            average_rating: avgRating,
            total_reviews: totalReviews,
            negative_count: negativeCount,
          },
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'gbp_monitor', priority: 'medium' },
        `gbp:low-rating:${new Date().toISOString().slice(0, 10)}`,
        'gbp_monitor',
      );
    }
  } else {
    logger.info({ jobId, brandId }, 'No GBP reviews found, skipping metrics and recommendations');
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'gbp_monitor',
      newReviews: newReviewCount,
      pendingDraftsGenerated: pendingReviews.length,
      totalReviews: allReviews.length,
      durationMs: Date.now() - startTime,
    },
    'GBP_Monitor completed',
  );
}
