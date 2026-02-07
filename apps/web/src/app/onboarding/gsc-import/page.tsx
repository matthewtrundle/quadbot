'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GscSitePicker, type GscSiteEntry } from '@/components/gsc-site-picker';

type CredentialInfo = {
  id: string;
  name: string;
  config: Record<string, unknown>;
};

type ImportResult = {
  brandId: string;
  brandName: string;
  siteUrl: string;
  success: boolean;
  error?: string;
};

type IntegrationOption = {
  id: string;
  name: string;
  description: string;
  scope: string;
  enabled: boolean;
};

const INTEGRATION_OPTIONS: IntegrationOption[] = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    description: 'Organic search performance, rankings, and click data',
    scope: 'webmasters.readonly',
    enabled: true,
  },
  {
    id: 'ads',
    name: 'Google Ads',
    description: 'Paid campaign performance, spend, and ROAS data',
    scope: 'adwords',
    enabled: false, // Requires additional setup
  },
  {
    id: 'analytics',
    name: 'Google Analytics 4',
    description: 'User behavior, conversions, and traffic sources',
    scope: 'analytics.readonly',
    enabled: false, // Requires additional setup
  },
];

function GscImportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const credentialId = searchParams.get('credentialId');
  const error = searchParams.get('error');

  const [credential, setCredential] = useState<CredentialInfo | null>(null);
  const [sites, setSites] = useState<GscSiteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>(['gsc']);

  // Fetch sites when credential ID is present
  useEffect(() => {
    if (credentialId) {
      fetchSites(credentialId);
    }
  }, [credentialId]);

  const fetchSites = async (id: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`/api/gsc/sites?credentialId=${id}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch sites');
      }
      const data = await response.json();
      setCredential(data.credential);
      setSites(data.sites);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch sites');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (selectedSites: { siteUrl: string; brandName: string }[]) => {
    if (!credentialId) return;

    setImporting(true);
    try {
      const response = await fetch('/api/gsc/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sharedCredentialId: credentialId,
          sites: selectedSites,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportResults(data.results);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleStartOAuth = () => {
    window.location.href = '/api/oauth/google/import';
  };

  // Show import results
  if (importResults) {
    const successCount = importResults.filter((r) => r.success).length;
    const failCount = importResults.filter((r) => !r.success).length;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Import Complete</CardTitle>
            <CardDescription>
              Successfully imported {successCount} brand{successCount !== 1 ? 's' : ''}
              {failCount > 0 && `, ${failCount} failed`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y">
              {importResults.map((result) => (
                <div
                  key={result.siteUrl}
                  className={`flex items-center justify-between py-3 ${result.success ? '' : 'text-destructive'}`}
                >
                  <div>
                    <p className="font-medium">{result.brandName}</p>
                    <p className="text-sm text-muted-foreground">{result.siteUrl}</p>
                  </div>
                  <span className={result.success ? 'text-green-600' : 'text-destructive'}>
                    {result.success ? 'Imported' : result.error}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 pt-4">
              <Button onClick={() => router.push('/brands')}>View Brands</Button>
              <Button variant="outline" onClick={() => setImportResults(null)}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show site picker if we have sites
  if (credentialId && sites.length > 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Import GSC Properties</h1>
          {credential && (
            <p className="text-muted-foreground">
              Connected as: {credential.name}
            </p>
          )}
        </div>

        {fetchError && (
          <Card className="border-destructive">
            <CardContent className="py-4 text-destructive">{fetchError}</CardContent>
          </Card>
        )}

        <GscSitePicker sites={sites} onImport={handleImport} isLoading={importing} />
      </div>
    );
  }

  const toggleIntegration = (id: string) => {
    setSelectedIntegrations((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // Show connect button (initial state)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Import from Google</h1>
        <p className="text-muted-foreground">
          Connect your Google accounts to automatically import properties and enable
          cross-channel intelligence.
        </p>
      </div>

      {(error || fetchError) && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive">{error || fetchError}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading properties...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Integrations</CardTitle>
              <CardDescription>
                Choose which Google services to connect. More integrations enable
                cross-channel insights.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {INTEGRATION_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  onClick={() => option.enabled && toggleIntegration(option.id)}
                  className={`flex items-center justify-between rounded border p-4 transition-colors ${
                    option.enabled
                      ? selectedIntegrations.includes(option.id)
                        ? 'border-primary bg-primary/5 cursor-pointer'
                        : 'hover:border-muted-foreground cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIntegrations.includes(option.id)}
                      onChange={() => option.enabled && toggleIntegration(option.id)}
                      disabled={!option.enabled}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{option.name}</span>
                        {!option.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connect Your Account</CardTitle>
              <CardDescription>
                We&apos;ll request read-only access to the selected services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleStartOAuth}
                className="w-full"
                disabled={selectedIntegrations.length === 0}
              >
                Connect {selectedIntegrations.length} Integration
                {selectedIntegrations.length !== 1 ? 's' : ''}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What happens next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Sign in with your Google account</p>
          <p>2. Grant read-only access to selected services</p>
          <p>3. Select which properties to import as brands</p>
          <p>4. Customize brand names if needed</p>
          <p>5. Start receiving intelligent insights across all channels</p>
        </CardContent>
      </Card>

      {selectedIntegrations.length >= 2 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-sm">
              <strong>Cross-Channel Intelligence Enabled:</strong> With {selectedIntegrations.length}{' '}
              integrations, you&apos;ll receive unified recommendations that leverage insights
              across all your data sources.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GscImportLoading() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Import from Google Search Console</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function GscImportPage() {
  return (
    <Suspense fallback={<GscImportLoading />}>
      <GscImportContent />
    </Suspense>
  );
}
