import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendReportEmail(options: {
  to: string[];
  brandName: string;
  periodStart: Date;
  periodEnd: Date;
  pdfBuffer: Buffer;
}) {
  const { to, brandName, periodStart, periodEnd, pdfBuffer } = options;

  const fromEmail = process.env.DIGEST_FROM_EMAIL || 'reports@quadbot.ai';

  // Format period for subject line (e.g., "Mar 1-19, 2026")
  const startMonth = periodStart.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = periodEnd.toLocaleDateString('en-US', { month: 'short' });
  const startDay = periodStart.getDate();
  const endDay = periodEnd.getDate();
  const endYear = periodEnd.getFullYear();

  const periodStr =
    startMonth === endMonth
      ? `${startMonth} ${startDay}\u2013${endDay}, ${endYear}`
      : `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${endYear}`;

  const subject = `${brandName} Performance Report \u2014 ${periodStr}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#8b5cf6,#ec4899);padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Performance Report</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${brandName}</p>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
          Your performance report for <strong>${brandName}</strong> covering
          <strong>${periodStr}</strong> is attached to this email.
        </p>
        <p style="margin:0;color:#6b7280;font-size:13px;">
          Open the attached PDF to review your metrics, recommendations, and insights.
        </p>
      </div>
      <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:11px;">QuadBot — Automated Performance Reports</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  const result = await resend.emails.send({
    from: `QuadBot Reports <${fromEmail}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `${brandName.replace(/[^a-zA-Z0-9-_ ]/g, '')}-report-${periodStr.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (result.error) {
    throw new Error(`Failed to send report email: ${result.error.message}`);
  }

  return { resendId: result.data?.id };
}
