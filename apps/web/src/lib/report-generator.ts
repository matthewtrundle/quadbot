import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportData = {
  brandName: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  executiveSummary: string;
  metrics: {
    name: string;
    currentValue: number;
    previousValue: number;
    delta: number;
    source: string;
  }[];
  recommendations: {
    title: string;
    priority: string;
    confidence: number;
    status: string;
    outcome?: { delta: number; metric: string };
  }[];
  actions: {
    type: string;
    status: string;
    predictedImpact: string | null;
    actualImpact: string | null;
  }[];
  content: {
    type: string;
    title: string;
    status: string;
    createdAt: Date;
  }[];
  outreach: {
    campaignName: string;
    totalSent: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
  }[];
  signals: {
    title: string;
    confidence: number;
    domain: string;
  }[];
  pendingRecommendations: {
    title: string;
    priority: string;
    confidence: number;
  }[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  primary: '#2563EB',
  dark: '#1a1a1a',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  white: '#ffffff',
  green: '#16a34a',
  red: '#dc2626',
  headerBg: '#e5e7eb',
} as const;

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDelta(n: number): string {
  if (n > 0) return `▲ +${n.toFixed(1)}`;
  if (n < 0) return `▼ ${n.toFixed(1)}`;
  return '— 0.0';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, yPos: number): number {
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.dark).text(title, MARGIN, yPos);

  const afterText = doc.y + 4;

  // Colored underline bar
  doc
    .save()
    .moveTo(MARGIN, afterText)
    .lineTo(MARGIN + CONTENT_WIDTH, afterText)
    .lineWidth(3)
    .strokeColor(COLORS.primary)
    .stroke()
    .restore();

  return afterText + 12;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  yPos: number,
  colWidths?: number[],
  cellColorFn?: (row: number, col: number, value: string) => string | undefined,
): number {
  const numCols = headers.length;
  const widths = colWidths ?? headers.map(() => Math.floor(CONTENT_WIDTH / numCols));

  const ROW_HEIGHT = 22;
  const CELL_PADDING = 6;
  const FONT_SIZE = 9;

  let y = yPos;

  // Header row background
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(COLORS.headerBg).restore();

  // Header text
  let x = MARGIN;
  for (let c = 0; c < numCols; c++) {
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT_SIZE)
      .fillColor(COLORS.dark)
      .text(headers[c], x + CELL_PADDING, y + 6, {
        width: widths[c] - CELL_PADDING * 2,
        lineBreak: false,
      });
    x += widths[c];
  }
  y += ROW_HEIGHT;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    // Check if we need a new page
    if (y + ROW_HEIGHT > PAGE_HEIGHT - MARGIN - 30) {
      doc.addPage();
      y = MARGIN;
    }

    // Alternating row background
    if (r % 2 === 0) {
      doc.save().rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(COLORS.lightGray).restore();
    }

    x = MARGIN;
    for (let c = 0; c < numCols; c++) {
      const val = rows[r][c] ?? '';
      const color = cellColorFn?.(r, c, val) ?? COLORS.dark;

      doc
        .font('Helvetica')
        .fontSize(FONT_SIZE)
        .fillColor(color)
        .text(val, x + CELL_PADDING, y + 6, {
          width: widths[c] - CELL_PADDING * 2,
          lineBreak: false,
        });
      x += widths[c];
    }
    y += ROW_HEIGHT;
  }

  return y + 8;
}

function addPageIfNeeded(doc: PDFKit.PDFDocument, requiredSpace: number, currentY: number): number {
  if (currentY + requiredSpace > PAGE_HEIGHT - MARGIN - 30) {
    doc.addPage();
    return MARGIN;
  }
  return currentY;
}

// ---------------------------------------------------------------------------
// Page number + footer tracking
// ---------------------------------------------------------------------------

function addFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const y = PAGE_HEIGHT - 35;

  // Page number center
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.gray).text(`Page ${pageNum}`, 0, y, {
    width: PAGE_WIDTH,
    align: 'center',
  });

  // "QuadBot" bottom right
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text('QuadBot', PAGE_WIDTH - MARGIN - 60, y, {
      width: 60,
      align: 'right',
    });
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    doc.pipe(stream);

    // -----------------------------------------------------------------------
    // 1. Cover Page
    // -----------------------------------------------------------------------
    doc.font('Helvetica-Bold').fontSize(36).fillColor(COLORS.primary).text('QuadBot', MARGIN, 180, { align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(18)
      .fillColor(COLORS.gray)
      .text('Client Performance Report', { align: 'center' })
      .moveDown(2);

    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(COLORS.dark)
      .text(data.brandName, { align: 'center' })
      .moveDown(1);

    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor(COLORS.gray)
      .text(`${formatDate(data.periodStart)} — ${formatDate(data.periodEnd)}`, { align: 'center' })
      .moveDown(4);

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(COLORS.gray)
      .text(`Generated ${formatDate(data.generatedAt)}`, {
        align: 'center',
      });

    // -----------------------------------------------------------------------
    // 2. Executive Summary
    // -----------------------------------------------------------------------
    doc.addPage();
    let y = MARGIN;

    y = drawSectionHeader(doc, 'Executive Summary', y);

    doc.font('Helvetica').fontSize(11).fillColor(COLORS.dark).text(data.executiveSummary, MARGIN, y, {
      width: CONTENT_WIDTH,
      lineGap: 4,
    });
    y = doc.y + 20;

    // -----------------------------------------------------------------------
    // 3. KPI Dashboard
    // -----------------------------------------------------------------------
    y = addPageIfNeeded(doc, 60 + data.metrics.length * 22, y);
    y = drawSectionHeader(doc, 'Key Performance Indicators', y);

    const kpiHeaders = ['Metric', 'Current', 'Previous', 'Change', 'Source'];
    const kpiWidths = [150, 80, 80, 100, CONTENT_WIDTH - 410];
    const kpiRows = data.metrics.map((m) => [
      m.name,
      m.currentValue.toLocaleString(),
      m.previousValue.toLocaleString(),
      formatDelta(m.delta),
      m.source,
    ]);

    y = drawTable(doc, kpiHeaders, kpiRows, y, kpiWidths, (_r, c, val) => {
      if (c === 3) {
        if (val.startsWith('▲')) return COLORS.green;
        if (val.startsWith('▼')) return COLORS.red;
      }
      return undefined;
    });

    // -----------------------------------------------------------------------
    // 4. Recommendations & Actions
    // -----------------------------------------------------------------------
    y = addPageIfNeeded(doc, 100, y);
    y = drawSectionHeader(doc, 'Recommendations & Actions', y);

    const totalRecs = data.recommendations.length;
    const approvedRecs = data.recommendations.filter((r) => r.status === 'approved' || r.status === 'executed').length;
    const executedRecs = data.recommendations.filter((r) => r.status === 'executed').length;

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(COLORS.dark)
      .text(`${totalRecs} recommendations made, ${approvedRecs} approved, ${executedRecs} executed`, MARGIN, y, {
        width: CONTENT_WIDTH,
      });
    y = doc.y + 10;

    // Recommendations table
    const recHeaders = ['Title', 'Priority', 'Confidence', 'Status'];
    const recWidths = [200, 90, 90, CONTENT_WIDTH - 380];
    const recRows = data.recommendations.map((r) => [
      truncate(r.title, 40),
      r.priority,
      formatPercent(r.confidence),
      r.status,
    ]);

    if (recRows.length > 0) {
      y = drawTable(doc, recHeaders, recRows, y, recWidths);
    }

    // Actions table
    if (data.actions.length > 0) {
      y = addPageIfNeeded(doc, 60, y);

      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.dark).text('Actions', MARGIN, y);
      y = doc.y + 8;

      const actHeaders = ['Type', 'Status', 'Predicted Impact', 'Actual Impact'];
      const actWidths = [120, 100, 140, CONTENT_WIDTH - 360];
      const actRows = data.actions.map((a) => [a.type, a.status, a.predictedImpact ?? '—', a.actualImpact ?? '—']);

      y = drawTable(doc, actHeaders, actRows, y, actWidths);
    }

    // -----------------------------------------------------------------------
    // 5. Content Production
    // -----------------------------------------------------------------------
    if (data.content.length > 0) {
      y = addPageIfNeeded(doc, 60 + data.content.length * 22, y);
      y = drawSectionHeader(doc, 'Content Produced', y);

      const contentHeaders = ['Type', 'Title', 'Status', 'Date'];
      const contentWidths = [80, 220, 90, CONTENT_WIDTH - 390];
      const contentRows = data.content.map((c) => [c.type, truncate(c.title, 45), c.status, formatDate(c.createdAt)]);

      y = drawTable(doc, contentHeaders, contentRows, y, contentWidths);
    }

    // -----------------------------------------------------------------------
    // 6. Outreach Performance
    // -----------------------------------------------------------------------
    if (data.outreach.length > 0) {
      y = addPageIfNeeded(doc, 60 + data.outreach.length * 22, y);
      y = drawSectionHeader(doc, 'Outreach Performance', y);

      const outHeaders = ['Campaign', 'Sent', 'Open Rate', 'Click Rate', 'Reply Rate'];
      const outWidths = [160, 70, 85, 85, CONTENT_WIDTH - 400];
      const outRows = data.outreach.map((o) => [
        truncate(o.campaignName, 30),
        o.totalSent.toLocaleString(),
        formatPercent(o.openRate),
        formatPercent(o.clickRate),
        formatPercent(o.replyRate),
      ]);

      y = drawTable(doc, outHeaders, outRows, y, outWidths);
    }

    // -----------------------------------------------------------------------
    // 7. AI Insights & Signals
    // -----------------------------------------------------------------------
    if (data.signals.length > 0) {
      y = addPageIfNeeded(doc, 40 + data.signals.length * 18, y);
      y = drawSectionHeader(doc, 'AI Insights & Signals', y);

      for (const signal of data.signals) {
        y = addPageIfNeeded(doc, 20, y);

        const confidenceStr = `${(signal.confidence * 100).toFixed(0)}%`;
        const bullet = `•  ${signal.title}  (${confidenceStr} confidence, ${signal.domain})`;

        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(COLORS.dark)
          .text(bullet, MARGIN + 10, y, { width: CONTENT_WIDTH - 10 });

        y = doc.y + 4;
      }
      y += 10;
    }

    // -----------------------------------------------------------------------
    // 8. Looking Ahead
    // -----------------------------------------------------------------------
    if (data.pendingRecommendations.length > 0) {
      y = addPageIfNeeded(doc, 40 + data.pendingRecommendations.length * 18, y);
      y = drawSectionHeader(doc, 'Looking Ahead', y);

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(COLORS.gray)
        .text('Top pending recommendations for the next period:', MARGIN, y, { width: CONTENT_WIDTH });
      y = doc.y + 8;

      for (const rec of data.pendingRecommendations) {
        y = addPageIfNeeded(doc, 20, y);

        const confStr = `${(rec.confidence * 100).toFixed(0)}%`;
        const line = `•  [${rec.priority.toUpperCase()}] ${rec.title}  (${confStr} confidence)`;

        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(COLORS.dark)
          .text(line, MARGIN + 10, y, { width: CONTENT_WIDTH - 10 });

        y = doc.y + 4;
      }
    }

    // -----------------------------------------------------------------------
    // Add page numbers + footer to every page
    // -----------------------------------------------------------------------
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      addFooter(doc, i + 1);
    }

    // Finalize
    doc.end();
  });
}
