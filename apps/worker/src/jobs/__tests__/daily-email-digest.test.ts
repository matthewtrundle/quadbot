import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the buildDigestHtml logic used in daily-email-digest.ts.
 * Tests HTML generation and content assembly without requiring Resend or database access.
 */

// Replicated from daily-email-digest.ts (private function)
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

describe('Daily Email Digest - buildDigestHtml', () => {
  const baseData = {
    brandName: 'Acme Corp',
    appUrl: 'https://app.quadbot.ai',
    brandId: 'brand-123',
    newRecs: [] as { id: string; title: string; priority: string; source: string }[],
    pendingActions: [] as { id: string; type: string; risk: string }[],
    recentNotifications: [] as { id: string; title: string; body: string }[],
    latestEval: null as { acceptance_rate: number | null; calibration_error: number | null } | null,
  };

  describe('brand name', () => {
    it('contains the brand name in the header', () => {
      const html = buildDigestHtml({ ...baseData });
      expect(html).toContain('Acme Corp');
    });

    it('contains the brand name for different brands', () => {
      const html = buildDigestHtml({ ...baseData, brandName: 'Test Brand XYZ' });
      expect(html).toContain('Test Brand XYZ');
    });
  });

  describe('recommendations', () => {
    it('contains recommendation titles when present', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [
          { id: 'rec-1', title: 'Fix crawl errors on /blog', priority: 'high', source: 'gsc_daily_digest' },
          { id: 'rec-2', title: 'Optimize meta descriptions', priority: 'medium', source: 'trend_scan' },
        ],
      });
      expect(html).toContain('Fix crawl errors on /blog');
      expect(html).toContain('Optimize meta descriptions');
    });

    it('contains correct recommendation count', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [
          { id: 'rec-1', title: 'Rec 1', priority: 'high', source: 'gsc' },
          { id: 'rec-2', title: 'Rec 2', priority: 'low', source: 'gsc' },
          { id: 'rec-3', title: 'Rec 3', priority: 'medium', source: 'gsc' },
        ],
      });
      expect(html).toContain('New Recommendations (3)');
    });

    it('shows no recommendations message when list is empty', () => {
      const html = buildDigestHtml({ ...baseData, newRecs: [] });
      expect(html).toContain('No new recommendations today.');
      expect(html).toContain('New Recommendations (0)');
    });

    it('links to individual recommendation pages', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: 'rec-abc', title: 'Test Rec', priority: 'high', source: 'gsc' }],
      });
      expect(html).toContain('https://app.quadbot.ai/recommendations/rec-abc');
    });
  });

  describe('priority colors', () => {
    it('shows correct color for critical priority', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'Critical Issue', priority: 'critical', source: 'gsc' }],
      });
      expect(html).toContain('#ef4444');
    });

    it('shows correct color for high priority', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'High Issue', priority: 'high', source: 'gsc' }],
      });
      expect(html).toContain('#f59e0b');
    });

    it('shows correct color for medium priority', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'Medium Issue', priority: 'medium', source: 'gsc' }],
      });
      expect(html).toContain('color:#3b82f6;font-weight:600;text-transform:uppercase');
    });

    it('shows correct color for low priority', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'Low Issue', priority: 'low', source: 'gsc' }],
      });
      expect(html).toContain('#6b7280');
    });

    it('falls back to gray for unknown priority', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'Unknown', priority: 'unknown', source: 'gsc' }],
      });
      // Falls back to '#6b7280'
      expect(html).toContain('#6b7280');
    });
  });

  describe('pending actions', () => {
    it('contains action count when actions exist', () => {
      const html = buildDigestHtml({
        ...baseData,
        pendingActions: [
          { id: 'act-1', type: 'gsc-index-request', risk: 'low' },
          { id: 'act-2', type: 'gsc-inspection', risk: 'medium' },
          { id: 'act-3', type: 'gsc-sitemap-notify', risk: 'low' },
        ],
      });
      expect(html).toContain('3 actions awaiting approval.');
    });

    it('uses singular when only one action', () => {
      const html = buildDigestHtml({
        ...baseData,
        pendingActions: [{ id: 'act-1', type: 'gsc-index-request', risk: 'low' }],
      });
      expect(html).toContain('1 action awaiting approval.');
    });

    it('does not show actions section when no pending actions', () => {
      const html = buildDigestHtml({ ...baseData, pendingActions: [] });
      expect(html).not.toContain('awaiting approval');
    });

    it('contains link to review actions', () => {
      const html = buildDigestHtml({
        ...baseData,
        pendingActions: [{ id: 'act-1', type: 'gsc-index-request', risk: 'low' }],
      });
      expect(html).toContain('https://app.quadbot.ai/brands/brand-123/actions');
      expect(html).toContain('Review now');
    });
  });

  describe('evaluation metrics', () => {
    it('shows evaluation metrics when available', () => {
      const html = buildDigestHtml({
        ...baseData,
        latestEval: { acceptance_rate: 0.75, calibration_error: 0.123 },
      });
      expect(html).toContain('Acceptance Rate');
      expect(html).toContain('75%');
      expect(html).toContain('Calibration Error');
      expect(html).toContain('0.123');
    });

    it('shows N/A when acceptance_rate is null', () => {
      const html = buildDigestHtml({
        ...baseData,
        latestEval: { acceptance_rate: null, calibration_error: 0.05 },
      });
      expect(html).toContain('N/A');
      expect(html).toContain('0.050');
    });

    it('shows N/A when calibration_error is null', () => {
      const html = buildDigestHtml({
        ...baseData,
        latestEval: { acceptance_rate: 0.5, calibration_error: null },
      });
      expect(html).toContain('50%');
      // The calibration error section should have N/A
      const evalSection = html.split('Calibration Error')[1];
      expect(evalSection).toContain('N/A');
    });

    it('does not show evaluation section when latestEval is null', () => {
      const html = buildDigestHtml({ ...baseData, latestEval: null });
      expect(html).not.toContain('Acceptance Rate');
      expect(html).not.toContain('Calibration Error');
    });
  });

  describe('source formatting', () => {
    it('replaces underscores with spaces in source names', () => {
      const html = buildDigestHtml({
        ...baseData,
        newRecs: [{ id: '1', title: 'Test', priority: 'low', source: 'gsc_daily_digest' }],
      });
      expect(html).toContain('gsc daily digest');
    });
  });

  describe('structural elements', () => {
    it('contains dashboard link', () => {
      const html = buildDigestHtml({ ...baseData });
      expect(html).toContain('https://app.quadbot.ai/dashboard');
      expect(html).toContain('Open Dashboard');
    });

    it('contains QuadBot footer', () => {
      const html = buildDigestHtml({ ...baseData });
      expect(html).toContain('QuadBot v2');
    });

    it('is valid HTML document', () => {
      const html = buildDigestHtml({ ...baseData });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
    });
  });
});
