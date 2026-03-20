'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StarRating } from '@/components/playbooks/star-rating';
import { ArrowLeft, Download, Search } from 'lucide-react';

interface MarketplaceTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  vertical: string | null;
  trigger_type: string;
  tags: string[];
  author_name: string | null;
  is_official: boolean;
  install_count: number;
  avgRating: number;
  rating_count: number;
  created_at: string;
}

interface MarketplaceResponse {
  templates: MarketplaceTemplate[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const CATEGORIES = ['all', 'seo', 'content', 'outreach', 'ads', 'analytics'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  seo: 'SEO',
  content: 'Content',
  outreach: 'Outreach',
  ads: 'Ads',
  analytics: 'Analytics',
};

const VERTICAL_LABELS: Record<string, string> = {
  all: 'All Verticals',
  ecommerce: 'E-commerce',
  saas: 'SaaS',
  local_business: 'Local Business',
  agency: 'Agency',
};

const SORT_LABELS: Record<string, string> = {
  popular: 'Most Popular',
  newest: 'Newest',
  top_rated: 'Top Rated',
};

export default function MarketplacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [vertical, setVertical] = useState('all');
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(1);
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [ratedIds, setRatedIds] = useState<Set<string>>(new Set());

  // Install dialog state
  const [installTarget, setInstallTarget] = useState<MarketplaceTemplate | null>(null);
  const [installing, setInstalling] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [category, vertical, sort]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        sort,
      });
      if (category !== 'all') params.set('category', category);
      if (vertical !== 'all') params.set('vertical', vertical);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/marketplace/templates?${params}`);
      if (!res.ok) throw new Error('Failed to fetch templates');

      const data: MarketplaceResponse = await res.json();
      setTemplates(data.templates);
      setTotal(data.pagination.total);
    } catch {
      setTemplates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, category, vertical, sort, debouncedSearch]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleInstall = async (template: MarketplaceTemplate) => {
    setInstalling(true);
    try {
      const res = await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          brandId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to install');
      }

      setInstalledIds((prev) => new Set(prev).add(template.id));
      setInstallTarget(null);
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleRate = async (templateId: string, rating: number) => {
    try {
      const res = await fetch('/api/marketplace/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          brandId,
          rating,
        }),
      });

      if (res.ok) {
        setRatedIds((prev) => new Set(prev).add(templateId));
        // Update the template's rating in local state
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  avgRating: (t.avgRating * t.rating_count + rating) / (t.rating_count + 1),
                  rating_count: t.rating_count + 1,
                }
              : t,
          ),
        );
      }
    } catch (err) {
      console.error('Rating failed:', err);
    }
  };

  const totalPages = Math.ceil(total / 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/brands/${brandId}/playbooks`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h2 className="text-xl font-semibold">Playbook Marketplace</h2>
          <p className="text-sm text-muted-foreground">Browse and install community playbook templates</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="pl-10"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Tabs value={category} onValueChange={setCategory} className="w-full sm:w-auto">
          <TabsList className="flex-wrap">
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="text-xs">
                {CATEGORY_LABELS[cat]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-2 ml-auto">
          <Select value={vertical} onValueChange={setVertical}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VERTICAL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {loading ? 'Loading...' : `${total} template${total !== 1 ? 's' : ''} found`}
      </p>

      {/* Template grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-full mt-2" />
                <div className="h-3 bg-muted rounded w-2/3 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No templates found matching your criteria.</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const isInstalled = installedIds.has(template.id);
            const isRated = ratedIds.has(template.id);

            return (
              <Card key={template.id} className="flex flex-col">
                <CardHeader className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                    {template.is_official && (
                      <Badge variant="default" className="shrink-0 text-[10px]">
                        Official
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2 text-xs">{template.description}</CardDescription>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABELS[template.category] || template.category}
                    </Badge>
                    {template.vertical && (
                      <Badge variant="secondary" className="text-[10px]">
                        {VERTICAL_LABELS[template.vertical] || template.vertical}
                      </Badge>
                    )}
                    {template.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] opacity-60">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Rating & stats */}
                  <div className="flex items-center justify-between">
                    <StarRating rating={Math.round(template.avgRating)} count={template.rating_count} />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Download className="h-3 w-3" />
                      {template.install_count}
                    </div>
                  </div>

                  {/* Author */}
                  {template.author_name && <p className="text-xs text-muted-foreground">by {template.author_name}</p>}

                  {/* Interactive rating (after install) */}
                  {isInstalled && !isRated && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Rate this template:</p>
                      <StarRating rating={0} interactive onRate={(r) => handleRate(template.id, r)} />
                    </div>
                  )}

                  {/* Install button */}
                  {isInstalled ? (
                    <Badge variant="default" className="w-full justify-center py-1.5 bg-green-600">
                      Installed
                    </Badge>
                  ) : (
                    <Button size="sm" className="w-full" onClick={() => setInstallTarget(template)}>
                      Install
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Install confirmation dialog */}
      <Dialog open={!!installTarget} onOpenChange={(open) => !open && setInstallTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Template</DialogTitle>
            <DialogDescription>
              Install &quot;{installTarget?.name}&quot; as a new playbook for your brand.
            </DialogDescription>
          </DialogHeader>

          {installTarget && (
            <div className="space-y-3">
              <p className="text-sm">{installTarget.description}</p>

              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {CATEGORY_LABELS[installTarget.category] || installTarget.category}
                </Badge>
                {installTarget.vertical && (
                  <Badge variant="secondary" className="text-[10px]">
                    {VERTICAL_LABELS[installTarget.vertical] || installTarget.vertical}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  Trigger: {installTarget.trigger_type}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <StarRating rating={Math.round(installTarget.avgRating)} count={installTarget.rating_count} />
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  {installTarget.install_count} installs
                </span>
              </div>

              {installTarget.author_name && (
                <p className="text-xs text-muted-foreground">
                  by {installTarget.author_name}
                  {installTarget.is_official && ' (Official)'}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => installTarget && handleInstall(installTarget)} disabled={installing}>
              {installing ? 'Installing...' : 'Install'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
