import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { generateReportPdf } from '@/lib/report-generator';
import {
  brands,
  clientReports,
  metricSnapshots,
  recommendations,
  actionDrafts,
  artifacts,
  outreachEmails,
  campaigns,
  signals,
  outcomes,
} from '@quadbot/db';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ---------------------------------------------------------------------------
// POST /api/brands/[id]/reports/generate
// ---------------------------------------------------------------------------
async function handler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Parse body ---
  let body: {
    title?: string;
    periodStart: string;
    periodEnd: string;
    recipientEmails?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.periodStart || !body.periodEnd) {
    return NextResponse.json({ error: 'periodStart and periodEnd are required' }, { status: 400 });
  }

  // --- Validate brand ---
  const [brand] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const periodStart = new Date(body.periodStart);
  const periodEnd = new Date(body.periodEnd);
  const thirtyDaysAgo = new Date(periodStart.getTime() - 30 * 24 * 60 * 60 * 1000);

  const reportTitle =
    body.title ||
    `${brand.name} Performance Report — ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;

  // --- Create report record with 'generating' status ---
  const [report] = await db
    .insert(clientReports)
    .values({
      brand_id: brandId,
      title: reportTitle,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'generating',
      recipient_emails: body.recipientEmails || [],
      generated_by: user.id,
    })
    .returning();

  try {
    // --- Aggregate data ---

    // Metric snapshots: latest vs 30-day-ago values
    const latestMetrics = await db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          lte(metricSnapshots.captured_at, periodEnd),
          gte(metricSnapshots.captured_at, periodStart),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at));

    const previousMetrics = await db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          lte(metricSnapshots.captured_at, periodStart),
          gte(metricSnapshots.captured_at, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at));

    // Recommendations created in period
    const periodRecommendations = await db
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.brand_id, brandId),
          gte(recommendations.created_at, periodStart),
          lte(recommendations.created_at, periodEnd),
        ),
      )
      .orderBy(desc(recommendations.created_at));

    // Action drafts in period
    const periodActions = await db
      .select()
      .from(actionDrafts)
      .where(
        and(
          eq(actionDrafts.brand_id, brandId),
          gte(actionDrafts.created_at, periodStart),
          lte(actionDrafts.created_at, periodEnd),
        ),
      )
      .orderBy(desc(actionDrafts.created_at));

    // Artifacts in period
    const periodArtifacts = await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.brand_id, brandId),
          gte(artifacts.created_at, periodStart),
          lte(artifacts.created_at, periodEnd),
        ),
      )
      .orderBy(desc(artifacts.created_at));

    // Campaign stats
    const periodCampaigns = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.brand_id, brandId),
          gte(campaigns.created_at, periodStart),
          lte(campaigns.created_at, periodEnd),
        ),
      )
      .orderBy(desc(campaigns.created_at));

    const periodOutreachEmails = await db
      .select()
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.brand_id, brandId),
          gte(outreachEmails.created_at, periodStart),
          lte(outreachEmails.created_at, periodEnd),
        ),
      )
      .orderBy(desc(outreachEmails.created_at));

    // Active signals
    const activeSignals = await db
      .select()
      .from(signals)
      .where(gte(signals.expires_at, new Date()))
      .orderBy(desc(signals.created_at));

    // Measured outcomes (join through recommendations to filter by brand)
    const periodOutcomes = await db
      .select({
        id: outcomes.id,
        recommendation_id: outcomes.recommendation_id,
        metric_name: outcomes.metric_name,
        metric_value_before: outcomes.metric_value_before,
        metric_value_after: outcomes.metric_value_after,
        delta: outcomes.delta,
        measured_at: outcomes.measured_at,
      })
      .from(outcomes)
      .innerJoin(recommendations, eq(outcomes.recommendation_id, recommendations.id))
      .where(
        and(
          eq(recommendations.brand_id, brandId),
          gte(outcomes.measured_at, periodStart),
          lte(outcomes.measured_at, periodEnd),
        ),
      )
      .orderBy(desc(outcomes.measured_at));

    // --- Build metrics summary for AI ---
    const metricsByKey = new Map<string, { current: number; previous: number }>();
    for (const m of latestMetrics) {
      if (!metricsByKey.has(m.metric_key)) {
        metricsByKey.set(m.metric_key, {
          current: Number(m.value),
          previous: 0,
        });
      }
    }
    for (const m of previousMetrics) {
      const existing = metricsByKey.get(m.metric_key);
      if (existing && existing.previous === 0) {
        existing.previous = Number(m.value);
      }
    }

    const metricsSummary = Array.from(metricsByKey.entries())
      .map(([key, { current, previous }]) => {
        const change = previous > 0 ? (((current - previous) / previous) * 100).toFixed(1) : 'N/A';
        return `${key}: ${current} (${change}% change)`;
      })
      .join(', ');

    // --- Generate executive summary with Claude ---
    const anthropic = getAnthropic();
    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Write a 3-4 sentence executive summary for a marketing performance report for ${brand.name}. Period: ${body.periodStart} to ${body.periodEnd}. Key data: ${metricsSummary || 'No metric data available'}. Recommendations generated: ${periodRecommendations.length}. Actions taken: ${periodActions.length}. Content pieces created: ${periodArtifacts.length}. Campaigns active: ${periodCampaigns.length}. Be professional and highlight wins.`,
        },
      ],
    });

    const executiveSummary = summaryResponse.content[0].type === 'text' ? summaryResponse.content[0].text : '';

    // --- Transform data for PDF generator ---
    const metricsForPdf = Array.from(metricsByKey.entries()).map(([key, { current, previous }]) => ({
      name: key,
      currentValue: current,
      previousValue: previous,
      delta: previous > 0 ? ((current - previous) / previous) * 100 : 0,
      source: latestMetrics.find((m) => m.metric_key === key)?.source ?? '',
    }));

    const pdfData = {
      brandName: brand.name,
      periodStart,
      periodEnd,
      generatedAt: new Date(),
      executiveSummary,
      metrics: metricsForPdf,
      recommendations: periodRecommendations.map((r) => ({
        title: r.title,
        priority: r.priority ?? 'medium',
        confidence: r.confidence ?? 0,
        status: r.status ?? 'active',
        outcome: periodOutcomes.find((o) => o.recommendation_id === r.id)
          ? {
              delta: periodOutcomes.find((o) => o.recommendation_id === r.id)!.delta ?? 0,
              metric: periodOutcomes.find((o) => o.recommendation_id === r.id)!.metric_name,
            }
          : undefined,
      })),
      actions: periodActions.map((a) => ({
        type: a.type,
        status: a.status ?? 'pending',
        predictedImpact: a.predicted_impact != null ? String(a.predicted_impact) : null,
        actualImpact: a.actual_impact != null ? String(a.actual_impact) : null,
      })),
      content: periodArtifacts.map((a) => ({
        type: a.type,
        title: (a.content as Record<string, string>)?.title ?? a.type,
        status: a.status ?? 'draft',
        createdAt: a.created_at,
      })),
      outreach: periodCampaigns.map((c) => {
        const emails = periodOutreachEmails.filter((e) => e.campaign_id === c.id);
        const sent = emails.length;
        const opened = emails.filter((e) => (e.open_count ?? 0) > 0).length;
        const clicked = emails.filter((e) => (e.click_count ?? 0) > 0).length;
        const replied = 0; // reply tracking is via conversations, not email status
        return {
          campaignName: c.name,
          totalSent: sent,
          openRate: sent > 0 ? (opened / sent) * 100 : 0,
          clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
          replyRate: sent > 0 ? (replied / sent) * 100 : 0,
        };
      }),
      signals: activeSignals.map((s) => ({
        title: s.title,
        confidence: s.confidence ?? 0,
        domain: s.domain ?? '',
      })),
      pendingRecommendations: periodRecommendations
        .filter((r) => r.status === 'active')
        .slice(0, 5)
        .map((r) => ({
          title: r.title,
          priority: r.priority ?? 'medium',
          confidence: r.confidence ?? 0,
        })),
    };

    // --- Generate PDF ---
    const pdfBuffer = await generateReportPdf(pdfData);

    const pdfBase64 = pdfBuffer.toString('base64');

    // --- Update report record ---
    await db
      .update(clientReports)
      .set({
        status: 'completed',
        report_data: pdfData as unknown as Record<string, unknown>,
        executive_summary: executiveSummary,
        pdf_base64: pdfBase64,
        completed_at: new Date(),
      })
      .where(eq(clientReports.id, report.id));

    // --- Send emails if recipients provided ---
    if (body.recipientEmails && body.recipientEmails.length > 0) {
      const resend = getResend();
      const periodLabel = `${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`;

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'reports@quadbot.app',
        to: body.recipientEmails,
        subject: `${brand.name} Performance Report — ${periodLabel}`,
        html: `<p>Please find attached the performance report for <strong>${brand.name}</strong> covering ${periodLabel}.</p><p><em>${executiveSummary}</em></p>`,
        attachments: [
          {
            filename: `${brand.name.replace(/\s+/g, '-')}-report-${body.periodStart}-to-${body.periodEnd}.pdf`,
            content: pdfBase64,
          },
        ],
      });

      await db.update(clientReports).set({ sent_at: new Date() }).where(eq(clientReports.id, report.id));
    }

    return NextResponse.json({
      id: report.id,
      status: 'completed',
      pdf: pdfBase64,
    });
  } catch (err) {
    // Mark report as failed
    await db
      .update(clientReports)
      .set({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .where(eq(clientReports.id, report.id));

    console.error('[report/generate] Failed:', err);
    return NextResponse.json({ error: 'Report generation failed', id: report.id }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, { maxRequests: 10, windowMs: 60_000 });
