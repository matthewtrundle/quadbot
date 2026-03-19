import { db } from '@/lib/db';
import { clientReports } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { ReportCard } from '@/components/reports/report-card';
import { GenerateReportForm } from '@/components/reports/generate-report-form';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const reports = await db
    .select()
    .from(clientReports)
    .where(eq(clientReports.brand_id, id))
    .orderBy(desc(clientReports.created_at));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reports</h2>
        <GenerateReportForm brandId={id} />
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">No reports yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate a client report to summarize brand performance, content metrics, and SEO progress over a given
                period.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={{
                id: report.id,
                brand_id: report.brand_id,
                title: report.title,
                period_start: report.period_start,
                period_end: report.period_end,
                status: report.status,
                created_at: report.created_at,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
