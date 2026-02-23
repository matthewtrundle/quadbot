'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewCampaignPage() {
  const router = useRouter();
  const { id: brandId } = useParams<{ id: string }>();
  const [saving, setSaving] = useState(false);

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
    setSteps([...steps, {
      step_order: steps.length + 1,
      delay_days: 3,
      subject_template: '',
      body_template: '',
      is_reply_to_previous: true,
    }]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (idx: number, field: string, value: any) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      send_days: f.send_days.includes(day)
        ? f.send_days.filter(d => d !== day)
        : [...f.send_days, day].sort(),
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/outreach/campaigns?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { setSaving(false); return; }
      const campaign = await res.json();

      // Save steps
      await fetch(`/api/outreach/campaigns/${campaign.id}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      });

      router.push(`/brands/${brandId}/outreach/campaigns/${campaign.id}`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Q1 Outreach" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div>
            <Label>Reply Mode</Label>
            <Select value={form.reply_mode} onValueChange={v => setForm(f => ({ ...f, reply_mode: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_draft_approve">AI Draft + Approve</SelectItem>
                <SelectItem value="ai_auto_reply">AI Auto-Reply</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.reply_mode !== 'manual' && (
            <div>
              <Label>AI Reply Context</Label>
              <Textarea value={form.ai_reply_context} onChange={e => setForm(f => ({ ...f, ai_reply_context: e.target.value }))} placeholder="Describe your product/goal for AI context..." />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Send Days</Label>
            <div className="flex gap-2 mt-1">
              {dayNames.map((name, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i + 1)}
                  className={`px-3 py-1 rounded text-sm border ${form.send_days.includes(i + 1) ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Window Start</Label>
              <Input type="time" value={form.send_window_start} onChange={e => setForm(f => ({ ...f, send_window_start: e.target.value }))} />
            </div>
            <div>
              <Label>Window End</Label>
              <Input type="time" value={form.send_window_end} onChange={e => setForm(f => ({ ...f, send_window_end: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Daily Limit</Label>
              <Input type="number" value={form.daily_send_limit} onChange={e => setForm(f => ({ ...f, daily_send_limit: parseInt(e.target.value) || 50 }))} />
            </div>
            <div>
              <Label>Min Spacing (s)</Label>
              <Input type="number" value={form.min_spacing_seconds} onChange={e => setForm(f => ({ ...f, min_spacing_seconds: parseInt(e.target.value) || 60 }))} />
            </div>
            <div>
              <Label>Max Spacing (s)</Label>
              <Input type="number" value={form.max_spacing_seconds} onChange={e => setForm(f => ({ ...f, max_spacing_seconds: parseInt(e.target.value) || 300 }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sequence Steps</CardTitle>
            <Button size="sm" variant="outline" onClick={addStep}>Add Step</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps.map((step, idx) => (
            <div key={idx} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Step {step.step_order}</span>
                {idx > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => removeStep(idx)}>Remove</Button>
                )}
              </div>
              {idx > 0 && (
                <div>
                  <Label>Delay (days after previous)</Label>
                  <Input type="number" value={step.delay_days} onChange={e => updateStep(idx, 'delay_days', parseInt(e.target.value) || 0)} />
                </div>
              )}
              <div>
                <Label>Subject</Label>
                <Input value={step.subject_template} onChange={e => updateStep(idx, 'subject_template', e.target.value)} placeholder="{{first_name}}, quick question about {{company}}" />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea rows={4} value={step.body_template} onChange={e => updateStep(idx, 'body_template', e.target.value)} placeholder="Hi {{first_name}},\n\nI noticed..." />
              </div>
              <p className="text-xs text-muted-foreground">
                Available variables: {'{{first_name}}'} {'{{last_name}}'} {'{{company}}'} {'{{title}}'} {'{{industry}}'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving || !form.name}>
          {saving ? 'Creating...' : 'Create Campaign'}
        </Button>
      </div>
    </div>
  );
}
