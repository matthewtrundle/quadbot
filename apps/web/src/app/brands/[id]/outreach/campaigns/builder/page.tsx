'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Plus, Trash2, RotateCcw } from 'lucide-react';

type SequenceStep = {
  step_order: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  is_reply_to_previous: boolean;
};

type GeneratedPlan = {
  name: string;
  description: string;
  reply_mode: string;
  schedule: {
    send_days: number[];
    send_window_start: string;
    send_window_end: string;
    daily_send_limit: number;
  };
  steps: SequenceStep[];
};

const CATEGORIES = [
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'reactivation', label: 'Reactivation' },
  { value: 'event_invite', label: 'Event Invite' },
  { value: 'product_launch', label: 'Product Launch' },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CampaignBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);
  const router = useRouter();

  // Phase 1 state
  const [brief, setBrief] = useState('');
  const [category, setCategory] = useState('cold_outreach');
  const [targetAudience, setTargetAudience] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Phase 2 state
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/outreach/campaign-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, brief, category, targetAudience }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate campaign');
      }
      const data = await res.json();
      setPlan(data);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate campaign. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!plan) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/outreach/campaign-builder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, ...plan }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create campaign');
      }
      const campaign = await res.json();
      router.push(`/brands/${brandId}/outreach/campaigns/${campaign.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campaign. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleRegenerate = () => {
    setPlan(null);
    setCreateError('');
  };

  const updatePlan = (updates: Partial<GeneratedPlan>) => {
    if (plan) setPlan({ ...plan, ...updates });
  };

  const updateSchedule = (updates: Partial<GeneratedPlan['schedule']>) => {
    if (plan) setPlan({ ...plan, schedule: { ...plan.schedule, ...updates } });
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    if (!plan) return;
    const newSteps = plan.steps.map((s, i) => (i === idx ? { ...s, ...updates } : s));
    setPlan({ ...plan, steps: newSteps });
  };

  const addStep = () => {
    if (!plan) return;
    setPlan({
      ...plan,
      steps: [
        ...plan.steps,
        {
          step_order: plan.steps.length + 1,
          delay_days: 3,
          subject_template: '',
          body_template: '',
          is_reply_to_previous: true,
        },
      ],
    });
  };

  const removeStep = (idx: number) => {
    if (!plan || plan.steps.length <= 1) return;
    setPlan({
      ...plan,
      steps: plan.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })),
    });
  };

  const toggleDay = (day: number) => {
    if (!plan) return;
    const days = plan.schedule.send_days;
    updateSchedule({
      send_days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort(),
    });
  };

  // Phase 1: Brief Input
  if (!plan) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold">AI Campaign Builder</h3>
          <p className="text-sm text-muted-foreground">
            Describe your campaign goals and let AI generate a complete outreach sequence.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Brief</CardTitle>
            <CardDescription>
              Tell the AI about your campaign. The more detail you provide, the better the result.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Brief *</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe your campaign goals, target audience, and key messages..."
                rows={6}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Audience (optional)</Label>
                <Input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., SaaS founders, marketing directors..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {genError && <p className="text-sm text-destructive">{genError}</p>}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating || !brief.trim()}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI is crafting your campaign...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Campaign
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Phase 2: Review & Edit
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Review Generated Campaign</h3>
          <p className="text-sm text-muted-foreground">Edit the AI-generated campaign before creating it.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRegenerate}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
      </div>

      {/* Campaign Details */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input value={plan.name} onChange={(e) => updatePlan({ name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={plan.description} onChange={(e) => updatePlan({ description: e.target.value })} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Reply Mode</Label>
            <Select value={plan.reply_mode} onValueChange={(v) => updatePlan({ reply_mode: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual -- Handle all replies yourself</SelectItem>
                <SelectItem value="ai_draft_approve">AI Draft -- AI drafts replies for your approval</SelectItem>
                <SelectItem value="ai_auto_reply">AI Auto -- AI replies automatically</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Send Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i + 1)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    plan.schedule.send_days.includes(i + 1)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Window Start</Label>
              <Input
                type="time"
                value={plan.schedule.send_window_start}
                onChange={(e) => updateSchedule({ send_window_start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Window End</Label>
              <Input
                type="time"
                value={plan.schedule.send_window_end}
                onChange={(e) => updateSchedule({ send_window_end: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Daily Limit</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={plan.schedule.daily_send_limit}
                onChange={(e) => updateSchedule({ daily_send_limit: Math.max(1, parseInt(e.target.value) || 50) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sequence Steps */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sequence Steps</CardTitle>
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus className="mr-2 h-4 w-4" />
              Add Step
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {plan.steps.map((step, idx) => (
            <div key={idx} className="rounded-lg border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Step {step.step_order}</Badge>
                  {idx === 0 && <span className="text-xs text-muted-foreground">Initial Email</span>}
                </div>
                {plan.steps.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeStep(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {idx > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Delay (days after previous)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={step.delay_days}
                      onChange={(e) => updateStep(idx, { delay_days: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="max-w-[120px]"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={step.is_reply_to_previous}
                      onCheckedChange={(checked) => updateStep(idx, { is_reply_to_previous: checked })}
                    />
                    <Label className="text-sm font-normal">Reply to previous</Label>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={step.subject_template}
                  onChange={(e) => updateStep(idx, { subject_template: e.target.value })}
                  placeholder="Email subject line..."
                />
              </div>

              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  rows={6}
                  value={step.body_template}
                  onChange={(e) => updateStep(idx, { body_template: e.target.value })}
                  placeholder="Email body..."
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Variables: {'{{first_name}}'} {'{{last_name}}'} {'{{company}}'} {'{{title}}'} {'{{industry}}'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {createError && <p className="text-sm text-destructive">{createError}</p>}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleRegenerate}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
        <Button onClick={handleCreate} disabled={creating || !plan.name.trim()}>
          {creating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Campaign'
          )}
        </Button>
      </div>
    </div>
  );
}
