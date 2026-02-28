import { brands, recommendations, actionDrafts, evaluationRuns, metricSnapshots, outcomes } from '@quadbot/db';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 6B: Weekly Summary Email
 * Sends a weekly summary per brand with:
 * - Recommendations acted on this week
 * - Measured outcomes (7-day windows completed)
 * - Confidence trend
 * - Top cross-brand signal highlight
 */
export async function weeklySummaryEmail(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'weekly_summary_email' }, 'Weekly_Summary_Email starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const resendApiKey = process.env.RESEND_API_KEY;
  const digestEmail = process.env.DIGEST_FROM_EMAIL || 'digest@quadbot.ai';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!resendApiKey) {
    logger.warn({ jobId, brandId }, 'RESEND_API_KEY not set, skipping weekly summary');
    return;
  }

  const recipientEmail = process.env.DIGEST_RECIPIENT_EMAIL;
  if (!recipientEmail) {
    logger.warn({ jobId, brandId }, 'DIGEST_RECIPIENT_EMAIL not set, skipping weekly summary');
    return;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Gather weekly data in parallel
  const [
    weekRecs,
    weekApproved,
    weekRejected,
    weekOutcomes,
    recentEvals,
  ] = await Promise.all([
    // Recommendations created this week
    db
      .select({ id: recommendations.id, title: recommendations.title, priority: recommendations.priority, source: recommendations.source })
      .from(recommendations)
      .where(and(eq(recommendations.brand_id, brandId), gte(recommendations.created_at, sevenDaysAgo)))
      .orderBy(desc(recommendations.created_at)),

    // Actions approved this week
    db
      .select({ id: actionDrafts.id, type: actionDrafts.type, status: actionDrafts.status })
      .from(actionDrafts)
      .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.status, 'approved'), gte(actionDrafts.updated_at, sevenDaysAgo))),

    // Actions rejected this week
    db
      .select({ id: actionDrafts.id })
      .from(actionDrafts)
      .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.status, 'rejected'), gte(actionDrafts.updated_at, sevenDaysAgo))),

    // Outcomes measured this week (join through recommendations for brand filter)
    db
      .select({
        id: outcomes.id,
        metric_name: outcomes.metric_name,
        delta: outcomes.delta,
        recommendation_id: outcomes.recommendation_id,
      })
      .from(outcomes)
      .innerJoin(recommendations, eq(outcomes.recommendation_id, recommendations.id))
      .where(and(eq(recommendations.brand_id, brandId), gte(outcomes.measured_at, sevenDaysAgo)))
      .limit(20),

    // Last 4 evaluation runs for trend
    db
      .select({
        acceptance_rate: evaluationRuns.acceptance_rate,
        calibration_error: evaluationRuns.calibration_error,
        created_at: evaluationRuns.created_at,
      })
      .from(evaluationRuns)
      .where(eq(evaluationRuns.brand_id, brandId))
      .orderBy(desc(evaluationRuns.created_at))
      .limit(4),
  ]);

  if (weekRecs.length === 0 && weekApproved.length === 0 && weekOutcomes.length === 0) {
    logger.info({ jobId, brandId }, 'No weekly activity to report, skipping summary');
    return;
  }

  // Compute confidence trend
  let confidenceTrend = 'Insufficient data';
  if (recentEvals.length >= 2) {
    const latest = recentEvals[0].calibration_error;
    const previous = recentEvals[1].calibration_error;
    if (latest != null && previous != null) {
      const delta = previous - latest;
      if (delta > 0.02) confidenceTrend = 'Improving';
      else if (delta < -0.02) confidenceTrend = 'Degrading';
      else confidenceTrend = 'Stable';
    }
  }

  // Outcome summary
  const positiveOutcomes = weekOutcomes.filter((o) => o.delta != null && o.delta > 0).length;
  const negativeOutcomes = weekOutcomes.filter((o) => o.delta != null && o.delta < 0).length;

  // Priority breakdown
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const rec of weekRecs) {
    if (rec.priority in priorityCounts) {
      priorityCounts[rec.priority as keyof typeof priorityCounts]++;
    }
  }

  // Source breakdown
  const sourceCounts = new Map<string, number>();
  for (const rec of weekRecs) {
    sourceCounts.set(rec.source, (sourceCounts.get(rec.source) || 0) + 1);
  }

  const html = buildWeeklySummaryHtml({
    brandName: brand.name,
    appUrl,
    brandId,
    weekRecs,
    weekApproved,
    weekRejected,
    weekOutcomes: { total: weekOutcomes.length, positive: positiveOutcomes, negative: negativeOutcomes },
    confidenceTrend,
    latestAcceptanceRate: recentEvals[0]?.acceptance_rate ?? null,
    latestCalibrationError: recentEvals[0]?.calibration_error ?? null,
    priorityCounts,
    sourceCounts,
  });

  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: `QuadBot <${digestEmail}>`,
    to: [recipientEmail],
    subject: `QuadBot Weekly Summary: ${brand.name} — ${weekRecs.length} recommendations, ${weekApproved.length} actions taken`,
    html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  logger.info({
    jobId, brandId, jobType: 'weekly_summary_email',
    resendId: result.data?.id,
    recs: weekRecs.length,
    approved: weekApproved.length,
    outcomes: weekOutcomes.length,
    durationMs: Date.now() - startTime,
  }, 'Weekly_Summary_Email completed');
}

function buildWeeklySummaryHtml(data: {
  brandName: string;
  appUrl: string;
  brandId: string;
  weekRecs: { id: string; title: string; priority: string; source: string }[];
  weekApproved: { id: string; type: string }[];
  weekRejected: { id: string }[];
  weekOutcomes: { total: number; positive: number; negative: number };
  confidenceTrend: string;
  latestAcceptanceRate: number | null;
  latestCalibrationError: number | null;
  priorityCounts: { critical: number; high: number; medium: number; low: number };
  sourceCounts: Map<string, number>;
}): string {
  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280',
  };

  const trendEmoji: Record<string, string> = {
    Improving: '&#8593;',
    Degrading: '&#8595;',
    Stable: '&#8596;',
    'Insufficient data': '&#8212;',
  };

  const trendColor: Record<string, string> = {
    Improving: '#22c55e',
    Degrading: '#ef4444',
    Stable: '#3b82f6',
    'Insufficient data': '#6b7280',
  };

  // Top 5 recs table
  const topRecs = data.weekRecs.slice(0, 5);
  const recsHtml = topRecs.length > 0
    ? topRecs.map((r) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <a href="${data.appUrl}/recommendations/${r.id}" style="color:#3b82f6;text-decoration:none;font-weight:500;">${r.title}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${priorityColors[r.priority] || '#6b7280'};font-weight:600;text-transform:uppercase;font-size:11px;">${r.priority}</span>
          </td>
        </tr>`).join('')
    : '<tr><td style="padding:12px;color:#9ca3af;">No recommendations this week.</td></tr>';

  // Source breakdown
  const sourceHtml = Array.from(data.sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:#f3f4f6;border-radius:4px;font-size:11px;color:#374151;">${source.replace(/_/g, ' ')} (${count})</span>`)
    .join('');

  // Actions summary
  const actionsHtml = data.weekApproved.length > 0 || data.weekRejected.length > 0
    ? `<div style="display:flex;gap:16px;">
         <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
           <div style="font-size:24px;font-weight:700;color:#22c55e;">${data.weekApproved.length}</div>
           <div style="font-size:12px;color:#6b7280;">Approved</div>
         </div>
         <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
           <div style="font-size:24px;font-weight:700;color:#ef4444;">${data.weekRejected.length}</div>
           <div style="font-size:12px;color:#6b7280;">Rejected</div>
         </div>
       </div>`
    : '<p style="color:#9ca3af;font-size:13px;">No actions taken this week.</p>';

  // Outcomes
  const outcomesHtml = data.weekOutcomes.total > 0
    ? `<div style="display:flex;gap:16px;">
         <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
           <div style="font-size:24px;font-weight:700;color:#22c55e;">${data.weekOutcomes.positive}</div>
           <div style="font-size:12px;color:#6b7280;">Positive</div>
         </div>
         <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
           <div style="font-size:24px;font-weight:700;color:#ef4444;">${data.weekOutcomes.negative}</div>
           <div style="font-size:12px;color:#6b7280;">Negative</div>
         </div>
         <div style="flex:1;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
           <div style="font-size:24px;font-weight:700;color:#6b7280;">${data.weekOutcomes.total - data.weekOutcomes.positive - data.weekOutcomes.negative}</div>
           <div style="font-size:12px;color:#6b7280;">Neutral</div>
         </div>
       </div>`
    : '<p style="color:#9ca3af;font-size:13px;">No outcomes measured yet. Outcomes are tracked 7-30 days after recommendations.</p>';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#8b5cf6,#ec4899);padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Weekly Summary</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${data.brandName}</p>
      </div>

      <div style="padding:24px 32px;">
        <!-- Stats Grid -->
        <div style="display:flex;gap:12px;margin-bottom:24px;">
          <div style="flex:1;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#1f2937;">${data.weekRecs.length}</div>
            <div style="font-size:11px;color:#6b7280;">Recommendations</div>
          </div>
          <div style="flex:1;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#1f2937;">${data.weekApproved.length}</div>
            <div style="font-size:11px;color:#6b7280;">Actions Taken</div>
          </div>
          <div style="flex:1;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:${trendColor[data.confidenceTrend]}">${trendEmoji[data.confidenceTrend]}</div>
            <div style="font-size:11px;color:#6b7280;">AI Accuracy: ${data.confidenceTrend}</div>
          </div>
        </div>

        <!-- Confidence Scores -->
        ${data.latestAcceptanceRate != null ? `
        <div style="padding:12px 16px;background:#f0f9ff;border-radius:8px;margin-bottom:24px;border-left:3px solid #3b82f6;">
          <span style="font-size:12px;color:#6b7280;">Acceptance Rate: </span>
          <strong style="font-size:14px;">${(data.latestAcceptanceRate * 100).toFixed(0)}%</strong>
          ${data.latestCalibrationError != null ? `<span style="margin-left:16px;font-size:12px;color:#6b7280;">Calibration Error: </span><strong style="font-size:14px;">${data.latestCalibrationError.toFixed(3)}</strong>` : ''}
        </div>` : ''}

        <!-- Top Recommendations -->
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Top Recommendations</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
          ${recsHtml}
        </table>
        ${data.weekRecs.length > 5 ? `<p style="font-size:12px;color:#9ca3af;margin:-16px 0 24px;">...and ${data.weekRecs.length - 5} more</p>` : ''}

        <!-- Sources -->
        ${sourceHtml ? `
        <div style="margin-bottom:24px;">
          <h3 style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;">Sources</h3>
          ${sourceHtml}
        </div>` : ''}

        <!-- Actions -->
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Actions</h2>
        <div style="margin-bottom:24px;">
          ${actionsHtml}
        </div>

        <!-- Outcomes -->
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Measured Outcomes</h2>
        <div style="margin-bottom:24px;">
          ${outcomesHtml}
        </div>

        <div style="margin-top:24px;text-align:center;">
          <a href="${data.appUrl}/brands/${data.brandId}/evaluation" style="display:inline-block;padding:10px 24px;background:#8b5cf6;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Full Evaluation</a>
        </div>
      </div>

      <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:11px;">QuadBot v2 — Intelligence Layer</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
