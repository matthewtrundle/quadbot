export type BrandingConfig = {
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  foreground_color?: string | null;
  font_family?: string | null;
  custom_domain?: string | null;
  app_name?: string | null;
  app_tagline?: string | null;
  footer_text?: string | null;
  hide_powered_by?: boolean;
  custom_css?: string | null;
  email_from_name?: string | null;
  email_from_address?: string | null;
};

export function getDefaultBranding(): BrandingConfig {
  return {
    primary_color: '#22d3ee',
    secondary_color: '#8b5cf6',
    accent_color: '#ec4899',
    background_color: '#0f0f14',
    foreground_color: '#e8eaed',
    font_family: 'Inter',
    app_name: 'QuadBot',
    app_tagline: 'AI Marketing Autopilot',
    hide_powered_by: false,
  };
}

export function generateCssVariables(config: BrandingConfig): string {
  const defaults = getDefaultBranding();
  const merged = { ...defaults, ...config };

  const fontFamily = merged.font_family ? `'${merged.font_family}', sans-serif` : "'Inter', sans-serif";

  return `:root {
  --brand-primary: ${merged.primary_color};
  --brand-secondary: ${merged.secondary_color};
  --brand-accent: ${merged.accent_color};
  --brand-bg: ${merged.background_color};
  --brand-fg: ${merged.foreground_color};
  --brand-font: ${fontFamily};
}`;
}
