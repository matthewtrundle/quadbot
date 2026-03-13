'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Github, Check, ExternalLink } from 'lucide-react';

interface PublishConfig {
  id: string;
  brand_id: string;
  type: string;
  name: string;
  config: {
    owner: string;
    repo: string;
    branch: string;
    blog_directory: string;
    content_format: 'nextjs_page' | 'mdx' | 'markdown';
    site_url: string;
    auto_merge: boolean;
  };
  is_active: boolean;
  last_published_at: string | null;
  created_at: string;
  updated_at: string;
}

const FORMAT_LABELS: Record<string, string> = {
  nextjs_page: 'Next.js Page',
  mdx: 'MDX',
  markdown: 'Markdown',
};

export default function GitHubSettingsPage() {
  const { id: brandId } = useParams<{ id: string }>();
  const [configs, setConfigs] = useState<PublishConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    owner: '',
    repo: '',
    branch: 'main',
    blog_directory: 'app/blog',
    site_url: '',
    content_format: 'nextjs_page' as 'nextjs_page' | 'mdx' | 'markdown',
    github_token: '',
    auto_merge: false,
  });

  useEffect(() => {
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function fetchConfigs() {
    try {
      const res = await fetch(`/api/brands/${brandId}/publish-config`);
      if (!res.ok) throw new Error('Failed to load configs');
      const data = await res.json();
      setConfigs(data);
    } catch {
      setError('Failed to load publish configurations');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/publish-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.fieldErrors ? 'Validation failed. Check all required fields.' : 'Failed to save');
      }
      const created = await res.json();
      setConfigs((prev) => [...prev, created]);
      setShowForm(false);
      setForm({
        owner: '',
        repo: '',
        branch: 'main',
        blog_directory: 'app/blog',
        site_url: '',
        content_format: 'nextjs_page',
        github_token: '',
        auto_merge: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground p-4">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub CMS Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect GitHub repositories for automated content publishing.
          </p>
        </div>
        {!showForm && <Button onClick={() => setShowForm(true)}>Connect Repository</Button>}
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Existing configs */}
      {configs.map((cfg) => (
        <Card key={cfg.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <CardTitle className="text-base">
                  {cfg.config.owner}/{cfg.config.repo}
                </CardTitle>
              </div>
              <Badge variant={cfg.is_active ? 'default' : 'secondary'}>
                {cfg.is_active ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Active
                  </span>
                ) : (
                  'Inactive'
                )}
              </Badge>
            </div>
            <CardDescription>{cfg.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Branch:</span>{' '}
                <span className="font-mono">{cfg.config.branch}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Format:</span>{' '}
                {FORMAT_LABELS[cfg.config.content_format] ?? cfg.config.content_format}
              </div>
              <div>
                <span className="text-muted-foreground">Blog Directory:</span>{' '}
                <span className="font-mono">{cfg.config.blog_directory}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Last Published:</span>{' '}
                {cfg.last_published_at ? new Date(cfg.last_published_at).toLocaleDateString() : 'Never'}
              </div>
              {cfg.config.site_url && (
                <div className="col-span-2">
                  <a
                    href={cfg.config.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {cfg.config.site_url}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {configs.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No repositories connected. Click &quot;Connect Repository&quot; to get started.
          </CardContent>
        </Card>
      )}

      {/* Inline form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect a GitHub Repository</CardTitle>
            <CardDescription>Provide the details of the repository where content will be published.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="owner" className="text-sm font-medium">
                  Owner <span className="text-destructive">*</span>
                </label>
                <input
                  id="owner"
                  type="text"
                  placeholder="github-username-or-org"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.owner}
                  onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="repo" className="text-sm font-medium">
                  Repository <span className="text-destructive">*</span>
                </label>
                <input
                  id="repo"
                  type="text"
                  placeholder="my-blog"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.repo}
                  onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="branch" className="text-sm font-medium">
                  Branch
                </label>
                <input
                  id="branch"
                  type="text"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="blog_directory" className="text-sm font-medium">
                  Blog Directory <span className="text-destructive">*</span>
                </label>
                <input
                  id="blog_directory"
                  type="text"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.blog_directory}
                  onChange={(e) => setForm((f) => ({ ...f, blog_directory: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="site_url" className="text-sm font-medium">
                  Site URL <span className="text-destructive">*</span>
                </label>
                <input
                  id="site_url"
                  type="url"
                  placeholder="https://example.com"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.site_url}
                  onChange={(e) => setForm((f) => ({ ...f, site_url: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="content_format" className="text-sm font-medium">
                  Content Format
                </label>
                <select
                  id="content_format"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.content_format}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      content_format: e.target.value as 'nextjs_page' | 'mdx' | 'markdown',
                    }))
                  }
                >
                  <option value="nextjs_page">Next.js Page</option>
                  <option value="mdx">MDX</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="github_token" className="text-sm font-medium">
                GitHub Token
              </label>
              <input
                id="github_token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxx"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.github_token}
                onChange={(e) => setForm((f) => ({ ...f, github_token: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                A personal access token with <code className="font-mono">repo</code> scope. The token is encrypted at
                rest.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="auto_merge"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.auto_merge}
                onChange={(e) => setForm((f) => ({ ...f, auto_merge: e.target.checked }))}
              />
              <label htmlFor="auto_merge" className="text-sm">
                Auto-merge pull requests (skip manual review)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
