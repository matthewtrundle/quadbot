import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { generateReportPdf, type ReportData } from '@/lib/report-generator';
import { clientReports } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// GET /api/brands/[id]/reports/[rid]/pdf
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id: brandId, rid: reportId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Fetch report ---
  const [report] = await db
    .select()
    .from(clientReports)
    .where(and(eq(clientReports.id, reportId), eq(clientReports.brand_id, brandId)))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  if (report.status !== 'completed' || !report.report_data) {
    return NextResponse.json({ error: 'Report is not yet completed' }, { status: 400 });
  }

  // --- Re-generate PDF from stored report_data ---
  const reportData = report.report_data as Record<string, unknown>;
  const pdfBuffer = await generateReportPdf({
    brandName: (reportData.brand as { name: string })?.name ?? 'Unknown',
    periodStart: new Date(reportData.period ? (reportData.period as { start: string }).start : report.period_start),
    periodEnd: new Date(reportData.period ? (reportData.period as { end: string }).end : report.period_end),
    generatedAt: new Date(report.created_at),
    executiveSummary: report.executive_summary ?? '',
    metrics: (reportData.metrics as ReportData['metrics']) ?? [],
    recommendations: (reportData.recommendations as ReportData['recommendations']) ?? [],
    actions: (reportData.actions as ReportData['actions']) ?? [],
    content: (reportData.content as ReportData['content']) ?? [],
    outreach: (reportData.outreach as ReportData['outreach']) ?? [],
    signals: (reportData.signals as ReportData['signals']) ?? [],
    pendingRecommendations: (reportData.pendingRecommendations as ReportData['pendingRecommendations']) ?? [],
  });

  const filename = `${report.title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')}.pdf`;

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}
