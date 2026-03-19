'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AddAccountForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '',
    from_name: '',
    resend_api_key: '',
    daily_limit: 50,
  });

  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/outreach/accounts?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to add account');
      setForm({ email: '', from_name: '', resend_api_key: '', daily_limit: 50 });
      setOpen(false);
      router.refresh();
    } catch {
      setError('Failed to add account. Please check your details and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add Account
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Sending Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>From Name</Label>
            <Input
              value={form.from_name}
              onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))}
              placeholder="John Smith"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="john@company.com"
            />
          </div>
        </div>
        <div>
          <Label>Resend API Key</Label>
          <Input
            type="password"
            value={form.resend_api_key}
            onChange={(e) => setForm((f) => ({ ...f, resend_api_key: e.target.value }))}
            placeholder="re_..."
          />
        </div>
        <div>
          <Label>Daily Limit</Label>
          <Input
            type="number"
            value={form.daily_limit}
            onChange={(e) => setForm((f) => ({ ...f, daily_limit: parseInt(e.target.value) || 50 }))}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving || !form.email || !form.resend_api_key}>
            {saving ? 'Saving...' : 'Add Account'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
