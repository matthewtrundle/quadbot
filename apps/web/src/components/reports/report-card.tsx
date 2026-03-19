'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Trash2, Loader2, Calendar } from 'lucide-react';

type ReportProps = {
  report: {
    id: string;
    brand_id: string;
    title: string;
    period_start: string | Date;
    period_end: string | Date;
    status: string;
    created_at: string | Date;
  };
};

function formatPeriod(start: string | Date, end: string | Date): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (sameYear) {
    return `${startStr} \u2014 ${endStr}`;
  }

  const startWithYear = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startWithYear} \u2014 ${endStr}`;
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'generating':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'generating':
      return 'Generating';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function ReportCard({ report }: ReportProps) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/brands/${report.brand_id}/reports/${report.id}/pdf`);
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title.replace(/[^a-zA-Z0-9-_ ]/g, '')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/brands/${report.brand_id}/reports/${report.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      router.refresh();
    } catch {
      // Delete failed silently
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base truncate">{report.title}</CardTitle>
          <Badge variant={getStatusBadgeVariant(report.status)}>{getStatusLabel(report.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatPeriod(report.period_start, report.period_end)}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Created{' '}
          {new Date(report.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={report.status !== 'completed' || downloading}
          >
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>

          <Button
            variant={confirmDelete ? 'destructive' : 'ghost'}
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            onBlur={() => setConfirmDelete(false)}
          >
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            {confirmDelete ? 'Confirm' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
