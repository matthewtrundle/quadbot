'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Calendar, Mail } from 'lucide-react';

function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function GenerateReportForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [title, setTitle] = useState('');
  const [periodStart, setPeriodStart] = useState(formatDateInput(thirtyDaysAgo));
  const [periodEnd, setPeriodEnd] = useState(formatDateInput(today));
  const [recipientEmails, setRecipientEmails] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const emails = recipientEmails
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean);

      const res = await fetch(`/api/brands/${brandId}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          periodStart,
          periodEnd,
          recipientEmails: emails.length > 0 ? emails : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to generate report');
      }

      setSuccess(true);
      setTitle('');
      setRecipientEmails('');
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <FileText className="h-4 w-4 mr-2" />
        Generate Report
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-base">Generate Report</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-title">Report Title</Label>
            <Input
              id="report-title"
              placeholder="e.g. March 2026 Performance Report"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="period-start" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Start Date
              </Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-end" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                End Date
              </Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient-emails" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Recipient Emails (optional)
            </Label>
            <Input
              id="recipient-emails"
              placeholder="client@example.com, team@example.com"
              value={recipientEmails}
              onChange={(e) => setRecipientEmails(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of email addresses</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {success && <p className="text-sm text-green-500">Report generated!</p>}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setError(null);
                setSuccess(false);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading || !title}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
