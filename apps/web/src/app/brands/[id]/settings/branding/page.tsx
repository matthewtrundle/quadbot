'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface BrandingSettings {
  app_name: string;
  app_tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  foreground_color: string;
  font_family: string;
  custom_domain: string;
  email_from_name: string;
  email_from_address: string;
  footer_text: string;
  hide_powered_by: boolean;
  custom_css: string;
}

const DEFAULTS: BrandingSettings = {
  app_name: '',
  app_tagline: '',
  logo_url: '',
  favicon_url: '',
  primary_color: '#6366f1',
  secondary_color: '#8b5cf6',
  accent_color: '#f59e0b',
  background_color: '#ffffff',
  foreground_color: '#0f172a',
  font_family: 'Inter',
  custom_domain: '',
  email_from_name: '',
  email_from_address: '',
  footer_text: '',
  hide_powered_by: false,
  custom_css: '',
};

const FONT_OPTIONS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Montserrat',
  'Source Sans Pro',
  'System Default',
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === '') {
              onChange(v);
            }
          }}
          placeholder="#000000"
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

export default function BrandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = use(params);
  const [settings, setSettings] = useState<BrandingSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/whitelabel`);
      if (res.ok) {
        const data = await res.json();
        setSettings({ ...DEFAULTS, ...data });
      }
    } catch {
      // Use defaults on error
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = <K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/whitelabel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Branding settings saved.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await fetch(`/api/brands/${brandId}/whitelabel`, { method: 'DELETE' });
      setSettings(DEFAULTS);
      setMessage({ type: 'success', text: 'Branding reset to defaults.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to reset settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading branding settings...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Brand Customization</h2>
        <p className="text-sm text-muted-foreground">Customize the look and feel of your white-label experience.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column — Settings form */}
        <div className="space-y-6">
          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
              <CardDescription>Basic brand identity settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="app-name">App Name</Label>
                <Input
                  id="app-name"
                  placeholder="QuadBot"
                  value={settings.app_name}
                  onChange={(e) => update('app_name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="app-tagline">App Tagline</Label>
                <Input
                  id="app-tagline"
                  placeholder="AI Marketing Autopilot"
                  value={settings.app_tagline}
                  onChange={(e) => update('app_tagline', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="logo-url">Logo URL</Label>
                <Input
                  id="logo-url"
                  placeholder="https://example.com/logo.png"
                  value={settings.logo_url}
                  onChange={(e) => update('logo_url', e.target.value)}
                />
                {settings.logo_url && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settings.logo_url}
                      alt="Logo preview"
                      className="h-8 w-auto rounded border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-xs text-muted-foreground">Logo preview</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="favicon-url">Favicon URL</Label>
                <Input
                  id="favicon-url"
                  placeholder="https://example.com/favicon.ico"
                  value={settings.favicon_url}
                  onChange={(e) => update('favicon_url', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colors</CardTitle>
              <CardDescription>Theme color palette</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Primary Color"
                value={settings.primary_color}
                onChange={(v) => update('primary_color', v)}
              />
              <ColorField
                label="Secondary Color"
                value={settings.secondary_color}
                onChange={(v) => update('secondary_color', v)}
              />
              <ColorField
                label="Accent Color"
                value={settings.accent_color}
                onChange={(v) => update('accent_color', v)}
              />
              <ColorField
                label="Background Color"
                value={settings.background_color}
                onChange={(v) => update('background_color', v)}
              />
              <ColorField
                label="Foreground Color"
                value={settings.foreground_color}
                onChange={(v) => update('foreground_color', v)}
              />
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Typography</CardTitle>
              <CardDescription>Font settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>Font Family</Label>
                <Select value={settings.font_family} onValueChange={(v) => update('font_family', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced</CardTitle>
              <CardDescription>Domain, email, and custom styling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="custom-domain">Custom Domain</Label>
                <Input
                  id="custom-domain"
                  placeholder="app.yourdomain.com"
                  value={settings.custom_domain}
                  onChange={(e) => update('custom_domain', e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email-from-name">Email From Name</Label>
                  <Input
                    id="email-from-name"
                    placeholder="Your Brand"
                    value={settings.email_from_name}
                    onChange={(e) => update('email_from_name', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-from-address">Email From Address</Label>
                  <Input
                    id="email-from-address"
                    placeholder="hello@yourdomain.com"
                    value={settings.email_from_address}
                    onChange={(e) => update('email_from_address', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="footer-text">Footer Text</Label>
                <Textarea
                  id="footer-text"
                  placeholder="© 2026 Your Brand. All rights reserved."
                  value={settings.footer_text}
                  onChange={(e) => update('footer_text', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="hide-powered-by" className="cursor-pointer">
                    Hide &quot;Powered by QuadBot&quot;
                  </Label>
                  <p className="text-xs text-muted-foreground">Remove QuadBot branding from the footer</p>
                </div>
                <Switch
                  id="hide-powered-by"
                  checked={settings.hide_powered_by}
                  onCheckedChange={(v) => update('hide_powered_by', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-css">Custom CSS</Label>
                <Textarea
                  id="custom-css"
                  placeholder="/* Custom CSS overrides */"
                  value={settings.custom_css}
                  onChange={(e) => update('custom_css', e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              Reset to Defaults
            </Button>
          </div>

          {message && (
            <p className={message.type === 'success' ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
              {message.text}
            </p>
          )}
        </div>

        {/* Right column — Live Preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Preview</CardTitle>
              <CardDescription>See how your brand looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview container */}
              <div
                className="overflow-hidden rounded-lg border"
                style={{
                  backgroundColor: settings.background_color,
                  color: settings.foreground_color,
                  fontFamily:
                    settings.font_family === 'System Default'
                      ? 'system-ui, sans-serif'
                      : `"${settings.font_family}", sans-serif`,
                }}
              >
                {/* Header bar */}
                <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: settings.primary_color }}>
                  {settings.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.logo_url}
                      alt="Logo"
                      className="h-5 w-auto"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="h-5 w-5 rounded bg-white/30" />
                  )}
                  <span className="text-sm font-semibold text-white">{settings.app_name || 'QuadBot'}</span>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">
                  <p className="text-base font-semibold" style={{ color: settings.foreground_color }}>
                    {settings.app_name || 'QuadBot'}
                  </p>
                  <p className="text-xs" style={{ color: settings.foreground_color, opacity: 0.7 }}>
                    {settings.app_tagline || 'AI Marketing Autopilot'}
                  </p>

                  {/* Color swatches */}
                  <div className="flex items-center gap-2 pt-2">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-6 w-6 rounded"
                        style={{ backgroundColor: settings.primary_color }}
                        title="Primary"
                      />
                      <span className="text-[10px] opacity-50">Primary</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-6 w-6 rounded"
                        style={{ backgroundColor: settings.secondary_color }}
                        title="Secondary"
                      />
                      <span className="text-[10px] opacity-50">Secondary</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="h-6 w-6 rounded"
                        style={{ backgroundColor: settings.accent_color }}
                        title="Accent"
                      />
                      <span className="text-[10px] opacity-50">Accent</span>
                    </div>
                  </div>

                  {/* Sample button */}
                  <button
                    className="mt-2 rounded px-3 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: settings.primary_color }}
                    type="button"
                    disabled
                  >
                    Sample Button
                  </button>
                </div>

                {/* Footer */}
                {!settings.hide_powered_by && (
                  <div
                    className="border-t px-3 py-1.5 text-[10px] opacity-40"
                    style={{
                      color: settings.foreground_color,
                      borderColor: `${settings.foreground_color}20`,
                    }}
                  >
                    Powered by {settings.app_name || 'QuadBot'}
                  </div>
                )}
              </div>

              {/* Font preview */}
              <div className="text-xs text-muted-foreground">
                Font:{' '}
                <span
                  style={{
                    fontFamily:
                      settings.font_family === 'System Default'
                        ? 'system-ui, sans-serif'
                        : `"${settings.font_family}", sans-serif`,
                  }}
                >
                  {settings.font_family}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
