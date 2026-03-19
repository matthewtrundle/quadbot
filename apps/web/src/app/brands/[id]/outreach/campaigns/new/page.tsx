'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

const STEPS = ['Details', 'Schedule', 'Sequence'] as const;

export default function NewCampaignPage() {
  const router = useRouter();
  const { id: brandId } = useParams<{ id: string }>();
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    reply_mode: 'manual' as string,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    send_days: [1, 2, 3, 4, 5],
    send_window_start: '09:00',
    send_window_end: '17:00',
    daily_send_limit: 50,
    min_spacing_seconds: 60,
    max_spacing_seconds: 300,
    ai_reply_context: '',
    ai_reply_tone: 'professional',
  });

  const [steps, setSteps] = useState([
    { step_order: 1, delay_days: 0, subject_template: '', body_template: '', is_reply_to_previous: false },
  ]);

  const addStep = () => {
    setSteps([
      ...steps,
      {
        step_order: steps.length + 1,
        delay_days: 3,
        subject_template: '',
        body_template: '',
        is_reply_to_previous: true,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (idx: number, field: string, value: string | number | boolean) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      send_days: f.send_days.includes(day) ? f.send_days.filter((d) => d !== day) : [...f.send_days, day].sort(),
    }));
  };

  const canAdvance = () => {
    if (currentStep === 0) return form.name.trim().length > 0;
    if (currentStep === 1) return form.send_days.length > 0;
    if (currentStep === 2)
      return steps[0].subject_template.trim().length > 0 && steps[0].body_template.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/campaigns?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError('Failed to create campaign. Please try again.');
        setSaving(false);
        return;
      }
      const campaign = await res.json();

      await fetch(`/api/outreach/campaigns/${campaign.id}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      });

      router.push(`/brands/${brandId}/outreach/campaigns/${campaign.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <button
              onClick={() => i < currentStep && setCurrentStep(i)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i < currentStep
                  ? 'bg-primary text-primary-foreground cursor-pointer'
                  : i === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
              }`}
              disabled={i >= currentStep}
            >
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </button>
            <span className={`text-sm font-medium ${i === currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step}
            </span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>Name your campaign and set the reply handling mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Q1 Partner Outreach"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this campaign about?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Reply Mode</Label>
              <Select value={form.reply_mode} onValueChange={(v) => setForm((f) => ({ ...f, reply_mode: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — Handle all replies yourself</SelectItem>
                  <SelectItem value="ai_draft_approve">AI Draft — AI drafts replies for your approval</SelectItem>
                  <SelectItem value="ai_auto_reply">AI Auto — AI replies automatically</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.reply_mode !== 'manual' && (
              <div className="space-y-2">
                <Label>AI Context</Label>
                <Textarea
                  value={form.ai_reply_context}
                  onChange={(e) => setForm((f) => ({ ...f, ai_reply_context: e.target.value }))}
                  placeholder="Describe your product/service so the AI can craft relevant replies..."
                  rows={3}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Schedule */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Choose when emails are sent and how they are paced.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Send Days</Label>
              <div className="flex flex-wrap gap-2">
                {dayNames.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i + 1)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.send_days.includes(i + 1)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Window Start</Label>
                <Input
                  type="time"
                  value={form.send_window_start}
                  onChange={(e) => setForm((f) => ({ ...f, send_window_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Window End</Label>
                <Input
                  type="time"
                  value={form.send_window_end}
                  onChange={(e) => setForm((f) => ({ ...f, send_window_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Daily Limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={form.daily_send_limit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, daily_send_limit: Math.max(1, parseInt(e.target.value) || 50) }))
                  }
                />
                <p className="text-xs text-muted-foreground">Max emails per day</p>
              </div>
              <div className="space-y-2">
                <Label>Min Gap (sec)</Label>
                <Input
                  type="number"
                  min={10}
                  value={form.min_spacing_seconds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, min_spacing_seconds: Math.max(10, parseInt(e.target.value) || 60) }))
                  }
                />
                <p className="text-xs text-muted-foreground">Between sends</p>
              </div>
              <div className="space-y-2">
                <Label>Max Gap (sec)</Label>
                <Input
                  type="number"
                  min={10}
                  value={form.max_spacing_seconds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_spacing_seconds: Math.max(10, parseInt(e.target.value) || 300) }))
                  }
                />
                <p className="text-xs text-muted-foreground">Random range</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Sequence */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Email Sequence</CardTitle>
                <CardDescription>Define the emails that will be sent to each lead.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addStep}>
                Add Step
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {steps.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-border/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                      {step.step_order}
                    </span>
                    <span className="text-sm font-medium">{idx === 0 ? 'Initial Email' : `Follow-up ${idx}`}</span>
                  </div>
                  {idx > 0 && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => removeStep(idx)}>
                      Remove
                    </Button>
                  )}
                </div>
                {idx > 0 && (
                  <div className="space-y-2">
                    <Label>Delay (days after previous)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={step.delay_days}
                      onChange={(e) => updateStep(idx, 'delay_days', Math.max(1, parseInt(e.target.value) || 1))}
                      className="max-w-[120px]"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Subject {idx === 0 && '*'}</Label>
                  <Input
                    value={step.subject_template}
                    onChange={(e) => updateStep(idx, 'subject_template', e.target.value)}
                    placeholder="{{first_name}}, quick question about {{company}}"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body {idx === 0 && '*'}</Label>
                  <Textarea
                    rows={4}
                    value={step.body_template}
                    onChange={(e) => updateStep(idx, 'body_template', e.target.value)}
                    placeholder="Hi {{first_name}},&#10;&#10;I noticed..."
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Variables: {'{{first_name}}'} {'{{last_name}}'} {'{{company}}'} {'{{title}}'} {'{{industry}}'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => (currentStep === 0 ? router.back() : setCurrentStep((s) => s - 1))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!canAdvance()}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={saving || !canAdvance()}>
            {saving ? 'Creating...' : 'Create Campaign'}
          </Button>
        )}
      </div>
    </div>
  );
}
