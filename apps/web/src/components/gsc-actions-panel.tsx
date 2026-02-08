'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Search, Globe, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  brandId: string;
  recData: Record<string, unknown>;
  source: string;
};

type InspectionResult = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict: string;
      coverageState: string;
      lastCrawlTime?: string;
      indexingState: string;
      pageFetchState: string;
    };
    mobileUsabilityResult?: {
      verdict: string;
    };
    richResultsResult?: {
      verdict: string;
      detectedItems?: Array<{ richResultType: string }>;
    };
  };
};

export function GscActionsPanel({ brandId, recData, source }: Props) {
  const [inspectLoading, setInspectLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<InspectionResult | null>(null);

  if (!source.startsWith('gsc')) return null;

  // Extract URL from recommendation data
  const url =
    (recData.url as string) ||
    (recData.page as string) ||
    ((recData.top_changes as Array<{ query?: string }> | undefined)?.[0]?.query) ||
    '';

  if (!url) return null;

  async function callGscAction(action: 'inspect' | 'index' | 'sitemap') {
    const setLoading =
      action === 'inspect' ? setInspectLoading :
      action === 'index' ? setIndexLoading :
      setSitemapLoading;

    setLoading(true);
    try {
      const res = await fetch('/api/gsc-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url, brand_id: brandId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Action failed');
      }

      const result = await res.json();

      if (action === 'inspect') {
        setInspectionResult(result as InspectionResult);
        toast.success('URL inspection complete');
      } else if (action === 'index') {
        toast.success('Indexing request submitted');
      } else {
        toast.success('Sitemap ping sent');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GSC action failed');
    } finally {
      setLoading(false);
    }
  }

  const idx = inspectionResult?.inspectionResult?.indexStatusResult;
  const mobile = inspectionResult?.inspectionResult?.mobileUsabilityResult;
  const rich = inspectionResult?.inspectionResult?.richResultsResult;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GSC Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground truncate">
          Target: <span className="font-mono">{url}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => callGscAction('inspect')}
            disabled={inspectLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            {inspectLoading ? 'Inspecting...' : 'Inspect URL'}
          </button>
          <button
            onClick={() => callGscAction('index')}
            disabled={indexLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <Globe className="h-3.5 w-3.5" />
            {indexLoading ? 'Requesting...' : 'Request Indexing'}
          </button>
          <button
            onClick={() => callGscAction('sitemap')}
            disabled={sitemapLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            {sitemapLoading ? 'Pinging...' : 'Ping Sitemap'}
          </button>
        </div>

        {idx && (
          <div className="rounded-md border border-border/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Inspection Results</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Verdict: </span>
                <span className="font-medium">{idx.verdict}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Coverage: </span>
                <span className="font-medium">{idx.coverageState}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Indexing: </span>
                <span className="font-medium">{idx.indexingState}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fetch: </span>
                <span className="font-medium">{idx.pageFetchState}</span>
              </div>
              {idx.lastCrawlTime && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Last Crawl: </span>
                  <span className="font-medium">{new Date(idx.lastCrawlTime).toLocaleString()}</span>
                </div>
              )}
            </div>
            {mobile && (
              <div className="text-xs">
                <span className="text-muted-foreground">Mobile Usability: </span>
                <span className="font-medium">{mobile.verdict}</span>
              </div>
            )}
            {rich && (
              <div className="text-xs">
                <span className="text-muted-foreground">Rich Results: </span>
                <span className="font-medium">
                  {rich.verdict}
                  {rich.detectedItems?.length
                    ? ` (${rich.detectedItems.map((d) => d.richResultType).join(', ')})`
                    : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
