'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, Download, Shield } from 'lucide-react';

type TemplateStep = {
  step_order: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  is_reply_to_previous: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  vertical: string;
  tags: string[];
  is_system: boolean;
  install_count: number;
  steps: TemplateStep[];
  default_config: {
    reply_mode: string;
    send_days: number[];
    send_window_start: string;
    send_window_end: string;
    daily_send_limit: number;
  };
};

const CATEGORY_TABS = [
  { value: 'all', label: 'All' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'reactivation', label: 'Reactivation' },
  { value: 'event_invite', label: 'Event Invite' },
  { value: 'product_launch', label: 'Product Launch' },
];

const CATEGORY_LABELS: Record<string, string> = {
  cold_outreach: 'Cold Outreach',
  follow_up: 'Follow Up',
  nurture: 'Nurture',
  reactivation: 'Reactivation',
  event_invite: 'Event Invite',
  product_launch: 'Product Launch',
};

export default function CampaignTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/outreach/campaign-templates');
        if (!res.ok) throw new Error('Failed to fetch templates');
        const data = await res.json();
        setTemplates(data);
      } catch {
        setError('Failed to load templates. Please try refreshing.');
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (activeTab !== 'all' && t.category !== activeTab) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [templates, activeTab, search]);

  const handleUseTemplate = async (template: Template) => {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/outreach/campaign-builder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          name: template.name,
          description: template.description,
          reply_mode: template.default_config.reply_mode,
          schedule: {
            send_days: template.default_config.send_days,
            send_window_start: template.default_config.send_window_start,
            send_window_end: template.default_config.send_window_end,
            daily_send_limit: template.default_config.daily_send_limit,
          },
          steps: template.steps,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create campaign');
      }
      const campaign = await res.json();
      router.push(`/brands/${brandId}/outreach/campaigns/${campaign.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Campaign Templates</h3>
        <p className="text-sm text-muted-foreground">Browse proven campaign templates and launch in minutes.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="pl-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          {CATEGORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORY_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No templates found{search ? ' matching your search' : ' in this category'}.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((template) => (
                  <Dialog
                    key={template.id}
                    onOpenChange={(open) => {
                      if (open) {
                        setCreateError('');
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <CardDescription className="line-clamp-2 mt-1">{template.description}</CardDescription>
                            </div>
                            {template.is_system && (
                              <Badge variant="outline" className="shrink-0 gap-1">
                                <Shield className="h-3 w-3" />
                                System
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <Badge variant="secondary">{CATEGORY_LABELS[template.category] || template.category}</Badge>
                            {template.vertical && <Badge variant="outline">{template.vertical}</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {template.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Download className="h-3.5 w-3.5" />
                              {template.install_count} installs
                            </span>
                            <span>{template.steps.length} steps</span>
                          </div>
                        </CardContent>
                      </Card>
                    </DialogTrigger>

                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{template.name}</DialogTitle>
                        <DialogDescription>{template.description}</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{CATEGORY_LABELS[template.category] || template.category}</Badge>
                          {template.vertical && <Badge variant="outline">{template.vertical}</Badge>}
                          {template.is_system && (
                            <Badge variant="outline" className="gap-1">
                              <Shield className="h-3 w-3" />
                              System
                            </Badge>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-medium mb-3">Sequence Preview ({template.steps.length} steps)</h4>
                          <div className="space-y-3">
                            {template.steps.map((step) => (
                              <div key={step.step_order} className="rounded-lg border border-border/50 p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="secondary" className="text-xs">
                                    Step {step.step_order}
                                  </Badge>
                                  {step.delay_days > 0 && (
                                    <span className="text-xs text-muted-foreground">+{step.delay_days} days</span>
                                  )}
                                  {step.is_reply_to_previous && (
                                    <span className="text-xs text-muted-foreground">(reply to previous)</span>
                                  )}
                                </div>
                                <p className="text-sm font-medium">{step.subject_template}</p>
                                <p className="text-sm text-muted-foreground line-clamp-3 mt-1">{step.body_template}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {createError && <p className="text-sm text-destructive">{createError}</p>}

                      <DialogFooter>
                        <Button
                          onClick={() => handleUseTemplate(template)}
                          disabled={creating}
                          className="w-full sm:w-auto"
                        >
                          {creating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            'Create Campaign from Template'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
