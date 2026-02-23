import { brands, recommendations, actionDrafts, evaluationRuns, notifications } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { decrypt } from '@quadbot/db';
import { Resend } from 'resend';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 4: Daily Email Digest
 * Sends a daily summary email per brand via Resend.
 * Includes: new recommendations count, pending actions, key metrics,
 * and links to the dashboard.
 */
export async function dailyEmailDigest(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // Get Resend API key from integrations or env
  const resendApiKey = process.env.RESEND_API_KEY;
  const digestEmail = process.env.DIGEST_FROM_EMAIL || 'digest@quadbot.ai';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!resendApiKey) {
    logger.warn({ jobId, brandId }, 'RESEND_API_KEY not set, skipping email digest');
    return;
  }

  // Gather data for the digest
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [newRecs, pendingActions, recentNotifications, latestEval] = await Promise.all([
    db
      .select({ id: recommendations.id, title: recommendations.title, priority: recommendations.priority, source: recommendations.source })
      .from(recommendations)
      .where(and(eq(recommendations.brand_id, brandId), gte(recommendations.created_at, oneDayAgo)))
      .orderBy(desc(recommendations.created_at))
      .limit(10),
    db
      .select({ id: actionDrafts.id, type: actionDrafts.type, risk: actionDrafts.risk })
      .from(actionDrafts)
      .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.status, 'pending')))
      .limit(10),
    db
      .select({ id: notifications.id, title: notifications.title, body: notifications.body })
      .from(notifications)
      .where(and(eq(notifications.brand_id, brandId), gte(notifications.created_at, oneDayAgo)))
      .orderBy(desc(notifications.created_at))
      .limit(5),
    db
      .select()
      .from(evaluationRuns)
      .where(eq(evaluationRuns.brand_id, brandId))
      .orderBy(desc(evaluationRuns.created_at))
      .limit(1),
  ]);

  if (newRecs.length === 0 && pendingActions.length === 0 && recentNotifications.length === 0) {
    logger.info({ jobId, brandId }, 'No activity to report, skipping digest email');
    return;
  }

  // Build HTML email
  const html = buildDigestHtml({
    brandName: brand.name,
    appUrl,
    brandId,
    newRecs,
    pendingActions,
    recentNotifications,
    latestEval: latestEval[0] || null,
  });

  // Determine recipient — for now use brand owner or first user
  // In a full implementation you'd query users table
  const recipientEmail = process.env.DIGEST_RECIPIENT_EMAIL;
  if (!recipientEmail) {
    logger.warn({ jobId, brandId }, 'DIGEST_RECIPIENT_EMAIL not set, skipping');
    return;
  }

  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: `QuadBot <${digestEmail}>`,
    to: [recipientEmail],
    subject: `QuadBot Daily Digest: ${brand.name} — ${newRecs.length} new insights`,
    html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  logger.info({
    jobId, brandId,
    resendId: result.data?.id,
    newRecs: newRecs.length,
    pendingActions: pendingActions.length,
  }, 'Daily email digest sent');
}

function buildDigestHtml(data: {
  brandName: string;
  appUrl: string;
  brandId: string;
  newRecs: { id: string; title: string; priority: string; source: string }[];
  pendingActions: { id: string; type: string; risk: string }[];
  recentNotifications: { id: string; title: string; body: string }[];
  latestEval: { acceptance_rate: number | null; calibration_error: number | null } | null;
}): string {
  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280',
  };

  const recsHtml = data.newRecs.length > 0
    ? data.newRecs.map((r) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <a href="${data.appUrl}/recommendations/${r.id}" style="color:#3b82f6;text-decoration:none;font-weight:500;">${r.title}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${priorityColors[r.priority] || '#6b7280'};font-weight:600;text-transform:uppercase;font-size:11px;">${r.priority}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${r.source.replace(/_/g, ' ')}</td>
        </tr>`).join('')
    : '<tr><td style="padding:12px;color:#9ca3af;">No new recommendations today.</td></tr>';

  const actionsHtml = data.pendingActions.length > 0
    ? `<p style="margin:12px 0;font-size:14px;"><strong>${data.pendingActions.length} action${data.pendingActions.length > 1 ? 's' : ''} awaiting approval.</strong>
       <a href="${data.appUrl}/brands/${data.brandId}/actions" style="color:#3b82f6;text-decoration:none;">Review now</a></p>`
    : '';

  const evalHtml = data.latestEval
    ? `<div style="display:inline-block;margin-right:24px;">
         <span style="color:#6b7280;font-size:12px;">Acceptance Rate</span><br/>
         <span style="font-size:20px;font-weight:700;">${data.latestEval.acceptance_rate != null ? `${(data.latestEval.acceptance_rate * 100).toFixed(0)}%` : 'N/A'}</span>
       </div>
       <div style="display:inline-block;">
         <span style="color:#6b7280;font-size:12px;">Calibration Error</span><br/>
         <span style="font-size:20px;font-weight:700;">${data.latestEval.calibration_error != null ? data.latestEval.calibration_error.toFixed(3) : 'N/A'}</span>
       </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6);padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">QuadBot Daily Digest</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${data.brandName}</p>
      </div>
      <div style="padding:24px 32px;">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">New Recommendations (${data.newRecs.length})</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${recsHtml}
        </table>
        ${actionsHtml}
        ${evalHtml ? `<div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;">${evalHtml}</div>` : ''}
        <div style="margin-top:24px;text-align:center;">
          <a href="${data.appUrl}/dashboard" style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Open Dashboard</a>
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
