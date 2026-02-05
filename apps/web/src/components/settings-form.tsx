'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type SettingsFormProps = {
  brandId: string;
  mode: string;
  modulesEnabled: string[];
  guardrails: Record<string, unknown>;
};

const AVAILABLE_MODULES = ['community_moderation', 'gsc_digest', 'trend_scan'];

export function SettingsForm({ brandId, mode, modulesEnabled, guardrails }: SettingsFormProps) {
  const router = useRouter();
  const [currentMode, setCurrentMode] = useState(mode);
  const [modules, setModules] = useState<string[]>(modulesEnabled);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/brands`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: brandId,
          mode: currentMode,
          modules_enabled: modules,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function toggleModule(mod: string) {
    setModules((prev) => (prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]));
  }

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
          <CardTitle className="text-lg">Guardrails</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-md">
            {JSON.stringify(guardrails, null, 2)}
          </pre>
          <p className="text-sm text-muted-foreground mt-2">
            Guardrails configuration is read-only in v1. Edit via API.
          </p>
        </CardContent>
      </Card>

      <Separator />

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
