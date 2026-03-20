import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, outreachEmails, campaignLeads, campaignSequenceSteps } from '@quadbot/db';
import { eq, sql, and, gte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const brandId = url.searchParams.get('brandId');
  const campaignId = url.searchParams.get('campaignId');
  const period = parseInt(url.searchParams.get('period') || '30', 10);

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 });
  }

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - period);

  // Base conditions for emails filtered by period
  const emailConditions = campaignId
    ? and(
        eq(outreachEmails.brand_id, brandId),
        eq(outreachEmails.campaign_id, campaignId),
        gte(outreachEmails.sent_at, periodStart),
      )
    : and(eq(outreachEmails.brand_id, brandId), gte(outreachEmails.sent_at, periodStart));

  // Lead conditions
  const leadConditions = campaignId
    ? eq(campaignLeads.campaign_id, campaignId)
    : sql`${campaignLeads.campaign_id} IN (SELECT id FROM campaigns WHERE brand_id = ${brandId})`;

  // Campaign conditions
  const campaignConditions = campaignId
    ? and(eq(campaigns.brand_id, brandId), eq(campaigns.id, campaignId))
    : eq(campaigns.brand_id, brandId);

  const [
    summaryResult,
    stepPerformanceResult,
    leadFunnelResult,
    dailyStatsResult,
    campaignsResult,
    topSubjectsResult,
    hourlyDistributionResult,
  ] = await Promise.all([
    // 1. Overall summary
    db
      .select({
        totalSent: sql<number>`count(*)`,
        delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
        opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
        clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
        bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
      })
      .from(outreachEmails)
      .where(emailConditions),

    // 2. Step-level performance
    db
      .select({
        stepOrder: outreachEmails.step_order,
        subject: sql<string>`min(${campaignSequenceSteps.subject_template})`,
        totalSent: sql<number>`count(*)`,
        opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
        clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
        replied: sql<number>`0`, // replied tracked on campaignLeads, approximated below
        avgTimeBetweenSteps: sql<number>`coalesce(avg(extract(epoch from (${outreachEmails.sent_at} - lag(${outreachEmails.sent_at}) over (partition by ${outreachEmails.campaign_lead_id} order by ${outreachEmails.step_order})))) * 1000, 0)`,
      })
      .from(outreachEmails)
      .leftJoin(
        campaignSequenceSteps,
        and(
          eq(outreachEmails.campaign_id, campaignSequenceSteps.campaign_id),
          eq(outreachEmails.step_order, campaignSequenceSteps.step_order),
        ),
      )
      .where(emailConditions)
      .groupBy(outreachEmails.step_order)
      .orderBy(outreachEmails.step_order),

    // 3. Lead funnel
    db
      .select({
        stage: sql<string>`
          CASE
            WHEN ${campaignLeads.status} = 'replied' THEN 'replied'
            WHEN ${campaignLeads.status} = 'completed' THEN 'completed'
            WHEN ${campaignLeads.status} = 'pending' AND ${campaignLeads.current_step} = 0 THEN 'enrolled'
            ELSE 'step_' || ${campaignLeads.current_step} || '_sent'
          END
        `,
        count: sql<number>`count(*)`,
      })
      .from(campaignLeads)
      .where(leadConditions)
      .groupBy(
        sql`CASE
          WHEN ${campaignLeads.status} = 'replied' THEN 'replied'
          WHEN ${campaignLeads.status} = 'completed' THEN 'completed'
          WHEN ${campaignLeads.status} = 'pending' AND ${campaignLeads.current_step} = 0 THEN 'enrolled'
          ELSE 'step_' || ${campaignLeads.current_step} || '_sent'
        END`,
      ),

    // 4. Daily engagement timeline
    db
      .select({
        date: sql<string>`to_char(${outreachEmails.sent_at}, 'YYYY-MM-DD')`,
        sent: sql<number>`count(*)`,
        opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
        clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
        replied: sql<number>`0`, // placeholder - replies tracked on leads
        bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
      })
      .from(outreachEmails)
      .where(emailConditions)
      .groupBy(sql`to_char(${outreachEmails.sent_at}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${outreachEmails.sent_at}, 'YYYY-MM-DD')`),

    // 5. Campaign comparison
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        startedAt: campaigns.started_at,
        totalSent: sql<number>`coalesce((
          SELECT count(*) FROM outreach_emails
          WHERE outreach_emails.campaign_id = ${campaigns.id}
            AND outreach_emails.sent_at >= ${periodStart}
        ), 0)`,
        delivered: sql<number>`coalesce((
          SELECT count(*) FROM outreach_emails
          WHERE outreach_emails.campaign_id = ${campaigns.id}
            AND outreach_emails.sent_at >= ${periodStart}
            AND outreach_emails.status IN ('delivered', 'opened', 'clicked')
        ), 0)`,
        opened: sql<number>`coalesce((
          SELECT count(*) FROM outreach_emails
          WHERE outreach_emails.campaign_id = ${campaigns.id}
            AND outreach_emails.sent_at >= ${periodStart}
            AND outreach_emails.status IN ('opened', 'clicked')
        ), 0)`,
        clicked: sql<number>`coalesce((
          SELECT count(*) FROM outreach_emails
          WHERE outreach_emails.campaign_id = ${campaigns.id}
            AND outreach_emails.sent_at >= ${periodStart}
            AND outreach_emails.status = 'clicked'
        ), 0)`,
      })
      .from(campaigns)
      .where(campaignConditions),

    // 6. Top performing subjects
    db
      .select({
        subject: outreachEmails.subject,
        sent: sql<number>`count(*)`,
        opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
        clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
      })
      .from(outreachEmails)
      .where(emailConditions)
      .groupBy(outreachEmails.subject)
      .orderBy(
        sql`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))::float / nullif(count(*), 0) DESC`,
      )
      .limit(10),

    // 7. Hourly send distribution
    db
      .select({
        hour: sql<number>`extract(hour from ${outreachEmails.sent_at})::int`,
        sent: sql<number>`count(*)`,
        opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
      })
      .from(outreachEmails)
      .where(emailConditions)
      .groupBy(sql`extract(hour from ${outreachEmails.sent_at})::int`)
      .orderBy(sql`extract(hour from ${outreachEmails.sent_at})::int`),
  ]);

  // Get replied count from campaign leads for step performance enrichment
  const repliedByStepResult = await db
    .select({
      currentStep: campaignLeads.current_step,
      replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
    })
    .from(campaignLeads)
    .where(leadConditions)
    .groupBy(campaignLeads.current_step);

  const repliedByStep = new Map(repliedByStepResult.map((r) => [r.currentStep, r.replied]));

  // Also get total replied count for summary
  const totalReplied = repliedByStepResult.reduce((sum, r) => sum + r.replied, 0);

  // Build summary
  const s = summaryResult[0];
  const summary = {
    totalSent: s.totalSent,
    delivered: s.delivered,
    opened: s.opened,
    clicked: s.clicked,
    replied: totalReplied,
    bounced: s.bounced,
    deliveryRate: s.totalSent > 0 ? s.delivered / s.totalSent : 0,
    openRate: s.delivered > 0 ? s.opened / s.delivered : 0,
    clickRate: s.delivered > 0 ? s.clicked / s.delivered : 0,
    replyRate: s.delivered > 0 ? totalReplied / s.delivered : 0,
    bounceRate: s.totalSent > 0 ? s.bounced / s.totalSent : 0,
  };

  // Build step performance with reply data
  const stepPerformance = stepPerformanceResult.map((step) => {
    const replied: number = repliedByStep.get(step.stepOrder) ?? 0;
    return {
      stepOrder: step.stepOrder,
      subject: step.subject || '',
      totalSent: step.totalSent,
      opened: step.opened,
      clicked: step.clicked,
      replied,
      openRate: step.totalSent > 0 ? step.opened / step.totalSent : 0,
      clickRate: step.totalSent > 0 ? step.clicked / step.totalSent : 0,
      replyRate: step.totalSent > 0 ? replied / step.totalSent : 0,
      avgTimeBetweenSteps: step.avgTimeBetweenSteps,
    };
  });

  // Build lead funnel with percentages
  const totalLeads = leadFunnelResult.reduce((sum, f) => sum + f.count, 0);
  const leadFunnel = leadFunnelResult.map((f) => ({
    stage: f.stage,
    count: f.count,
    percentage: totalLeads > 0 ? f.count / totalLeads : 0,
  }));

  // Build daily stats (replied placeholder stays 0 since it's tracked on leads)
  const dailyStats = dailyStatsResult.map((d) => ({
    date: d.date,
    sent: d.sent,
    opened: d.opened,
    clicked: d.clicked,
    replied: d.replied,
    bounced: d.bounced,
  }));

  // Build campaign comparison with computed rates
  const campaignComparison = campaignsResult.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    totalSent: c.totalSent,
    openRate: c.delivered > 0 ? c.opened / c.delivered : 0,
    clickRate: c.delivered > 0 ? c.clicked / c.delivered : 0,
    replyRate: 0, // would need a separate query per campaign
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
  }));

  // Build top subjects
  const topSubjects = topSubjectsResult.map((t) => ({
    subject: t.subject,
    sent: t.sent,
    openRate: t.sent > 0 ? t.opened / t.sent : 0,
    clickRate: t.sent > 0 ? t.clicked / t.sent : 0,
  }));

  // Build hourly distribution
  const hourlyDistribution = hourlyDistributionResult.map((h) => ({
    hour: h.hour,
    sent: h.sent,
    opened: h.opened,
    openRate: h.sent > 0 ? h.opened / h.sent : 0,
  }));

  return NextResponse.json({
    summary,
    stepPerformance,
    leadFunnel,
    dailyStats,
    campaigns: campaignComparison,
    topSubjects,
    hourlyDistribution,
  });
}
