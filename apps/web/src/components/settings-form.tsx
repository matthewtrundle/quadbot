'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

type ExecutionRulesConfig = {
  auto_execute: boolean;
  min_confidence: number;
  max_risk: string;
  allowed_action_types: string[];
};

type SettingsFormProps = {
  brandId: string;
  mode: string;
  modulesEnabled: string[];
  guardrails: Record<string, unknown>;
  executionRules?: ExecutionRulesConfig;
};

const AVAILABLE_MODULES = ['community_moderation', 'gsc_digest', 'trend_scan'];

const INDUSTRY_OPTIONS = [
  'food & beverage',
  'technology',
  'healthcare',
  'retail',
  'finance',
  'marketing',
  'ecommerce',
  'travel',
  'gaming',
  'education',
  'real estate',
  'automotive',
  'entertainment',
  'other',
];

const DEFAULT_CONTENT_POLICIES = [
  'No tragedy/disaster exploitation',
  'No crime/violence references',
  'No political controversy',
  'No hate speech/discrimination',
  'No military conflict references',
  'No child exploitation references',
];

type BrandProfile = {
  industry: string;
  description: string;
  target_audience: string;
  keywords: string[];
  competitors: string[];
  content_policies: string[];
};

function parseGuardrails(guardrails: Record<string, unknown>): BrandProfile {
  return {
    industry: (guardrails.industry as string) || '',
    description: (guardrails.description as string) || '',
    target_audience: (guardrails.target_audience as string) || '',
    keywords: Array.isArray(guardrails.keywords) ? guardrails.keywords as string[] : [],
    competitors: Array.isArray(guardrails.competitors) ? guardrails.competitors as string[] : [],
    content_policies: Array.isArray(guardrails.content_policies)
      ? guardrails.content_policies as string[]
      : ['No tragedy/disaster exploitation', 'No crime/violence references'],
  };
}

export function SettingsForm({ brandId, mode, modulesEnabled, guardrails, executionRules: initialRules }: SettingsFormProps) {
  const router = useRouter();
  const [currentMode, setCurrentMode] = useState(mode);
  const [modules, setModules] = useState<string[]>(modulesEnabled);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  // Brand profile state
  const [profile, setProfile] = useState<BrandProfile>(() => parseGuardrails(guardrails));
  const [customIndustry, setCustomIndustry] = useState('');

  // Execution rules state
  const [execRules, setExecRules] = useState<ExecutionRulesConfig>(
    initialRules ?? { auto_execute: false, min_confidence: 0.9, max_risk: 'low', allowed_action_types: [] },
  );

  async function handleSave() {
    setSaving(true);
    try {
      const guardrailsPayload: BrandProfile = {
        ...profile,
        industry: profile.industry === 'other' && customIndustry ? customIndustry : profile.industry,
      };

      await fetch(`/api/brands`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: brandId,
          mode: currentMode,
          modules_enabled: modules,
          guardrails: guardrailsPayload,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      await fetch(`/api/jobs/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          jobType: 'brand_profiler',
        }),
      });
      // Wait a moment then refresh to show updated profile
      setTimeout(() => {
        router.refresh();
        setReanalyzing(false);
      }, 3000);
    } catch {
      setReanalyzing(false);
    }
  }

  function toggleModule(mod: string) {
    setModules((prev) => (prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]));
  }

  function toggleContentPolicy(policy: string) {
    setProfile((prev) => ({
      ...prev,
      content_policies: prev.content_policies.includes(policy)
        ? prev.content_policies.filter((p) => p !== policy)
        : [...prev.content_policies, policy],
    }));
  }

  async function handleSaveExecutionRules() {
    setSavingRules(true);
    try {
      await fetch(`/api/brands/${brandId}/execution-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execRules),
      });
      router.refresh();
    } finally {
      setSavingRules(false);
    }
  }

  const hasProfile = !!profile.industry && profile.industry !== 'unknown';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Assist Mode</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, Quadbot will generate action drafts for approval. When disabled, only recommendations are created (Observe mode).
              </p>
            </div>
            <Switch
              checked={currentMode === 'assist'}
              onCheckedChange={(checked) => setCurrentMode(checked ? 'assist' : 'observe')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {AVAILABLE_MODULES.map((mod) => (
            <div key={mod} className="flex items-center justify-between">
              <Label>{mod.replace(/_/g, ' ')}</Label>
              <Switch checked={modules.includes(mod)} onCheckedChange={() => toggleModule(mod)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Brand Profile</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              {reanalyzing ? 'Analyzing...' : 'Re-analyze'}
            </Button>
          </div>
          {!hasProfile && (
            <p className="text-sm text-muted-foreground">
              No brand profile detected yet. Click &quot;Re-analyze&quot; to auto-detect from your website, or fill in manually below.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Industry</Label>
            <Select
              value={INDUSTRY_OPTIONS.includes(profile.industry) ? profile.industry : profile.industry ? 'other' : ''}
              onValueChange={(value) => {
                setProfile((prev) => ({ ...prev, industry: value }));
                if (value !== 'other') setCustomIndustry('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {ind.charAt(0).toUpperCase() + ind.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(profile.industry === 'other' || (!INDUSTRY_OPTIONS.includes(profile.industry) && profile.industry)) && (
              <Input
                placeholder="Enter custom industry"
                value={INDUSTRY_OPTIONS.includes(profile.industry) ? customIndustry : profile.industry}
                onChange={(e) => {
                  if (INDUSTRY_OPTIONS.includes(profile.industry)) {
                    setCustomIndustry(e.target.value);
                  } else {
                    setProfile((prev) => ({ ...prev, industry: e.target.value }));
                  }
                }}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="What does this brand do?"
              value={profile.description}
              onChange={(e) => setProfile((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Input
              placeholder="e.g., Small business owners, food enthusiasts"
              value={profile.target_audience}
              onChange={(e) => setProfile((prev) => ({ ...prev, target_audience: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Keywords</Label>
            <Input
              placeholder="Comma-separated: tortillas, Mexican food, Tex-Mex"
              value={profile.keywords.join(', ')}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Industry and product keywords used for trend relevance filtering
            </p>
          </div>

          <div className="space-y-2">
            <Label>Competitors</Label>
            <Input
              placeholder="Comma-separated: Mission Tortillas, Old El Paso"
              value={profile.competitors.join(', ')}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  competitors: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                }))
              }
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Content Policies</Label>
            <p className="text-xs text-muted-foreground">
              Topics the trend scanner will automatically filter out
            </p>
            {DEFAULT_CONTENT_POLICIES.map((policy) => (
              <div key={policy} className="flex items-center gap-3">
                <Switch
                  checked={profile.content_policies.includes(policy)}
                  onCheckedChange={() => toggleContentPolicy(policy)}
                />
                <span className="text-sm">{policy}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auto-Execution Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Execute Actions</Label>
              <p className="text-sm text-muted-foreground">
                Automatically approve action drafts that meet confidence and risk thresholds.
              </p>
            </div>
            <Switch
              checked={execRules.auto_execute}
              onCheckedChange={(checked) => setExecRules((prev) => ({ ...prev, auto_execute: checked }))}
            />
          </div>

          {execRules.auto_execute && (
            <>
              <div className="space-y-2">
                <Label>Minimum Confidence ({Math.round(execRules.min_confidence * 100)}%)</Label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={Math.round(execRules.min_confidence * 100)}
                  onChange={(e) =>
                    setExecRules((prev) => ({ ...prev, min_confidence: Number(e.target.value) / 100 }))
                  }
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Only auto-approve actions where the recommendation confidence meets this threshold.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Maximum Risk</Label>
                <Select
                  value={execRules.max_risk}
                  onValueChange={(value) => setExecRules((prev) => ({ ...prev, max_risk: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low only</SelectItem>
                    <SelectItem value="medium">Medium and below</SelectItem>
                    <SelectItem value="high">All (including high)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button onClick={handleSaveExecutionRules} disabled={savingRules} variant="outline">
            {savingRules ? 'Saving...' : 'Save Execution Rules'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
