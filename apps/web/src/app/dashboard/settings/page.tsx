'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ExternalLink, AlertCircle } from 'lucide-react';

type Credential = {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  created_at: string;
};

function SettingsContent() {
  const searchParams = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  const connected = searchParams.get('connected');
  const error = searchParams.get('error');
  const service = searchParams.get('service');

  useEffect(() => {
    fetchCredentials();
  }, []);

  async function fetchCredentials() {
    try {
      const res = await fetch('/api/credentials');
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials || []);
      }
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    } finally {
      setLoading(false);
    }
  }

  const gscCredential = credentials.find(c => c.type === 'google_oauth');
  const analyticsCredential = credentials.find(c => c.type === 'google_analytics');
  const adsCredential = credentials.find(c => c.type === 'google_ads');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage connected services and integrations
        </p>
      </div>

      {connected && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            <span>
              Successfully connected {connected === 'analytics' ? 'Google Analytics' : 'Google Ads'}!
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>
              Failed to connect {service === 'analytics' ? 'Google Analytics' : service === 'ads' ? 'Google Ads' : 'service'}: {error}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Google Search Console */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Google Search Console</CardTitle>
              {gscCredential ? (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
            <CardDescription>
              Import keyword rankings, impressions, and click data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gscCredential ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{gscCredential.name}</p>
                <p className="text-muted-foreground">
                  {(gscCredential.config as any)?.sites_count || 0} sites available
                </p>
              </div>
            ) : (
              <Button asChild className="w-full">
                <a href="/api/oauth/google/import">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect GSC
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Google Analytics */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Google Analytics (GA4)</CardTitle>
              {analyticsCredential ? (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
            <CardDescription>
              Track sessions, users, bounce rates, and conversions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsCredential ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{analyticsCredential.name}</p>
                <p className="text-muted-foreground">
                  {(analyticsCredential.config as any)?.properties_count || 0} properties available
                </p>
              </div>
            ) : (
              <Button asChild className="w-full">
                <a href="/api/oauth/google/analytics">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect GA4
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Google Ads */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Google Ads</CardTitle>
              {adsCredential ? (
                <Badge variant="default" className="bg-green-600">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
            <CardDescription>
              Monitor ad spend, campaign performance, and conversions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adsCredential ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{adsCredential.name}</p>
                <p className="text-muted-foreground">
                  {(adsCredential.config as any)?.accounts_count || 0} accounts available
                </p>
              </div>
            ) : (
              <Button asChild className="w-full">
                <a href="/api/oauth/google/ads">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect Google Ads
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && (
        <p className="text-center text-muted-foreground">Loading credentials...</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
