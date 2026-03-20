'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type BrandingConfig, getDefaultBranding, generateCssVariables } from '@/lib/branding';

type BrandingContextValue = BrandingConfig & { isLoaded: boolean };

const BrandingContext = createContext<BrandingContextValue>({
  ...getDefaultBranding(),
  isLoaded: false,
});

const GOOGLE_FONTS_LINK_ID = 'branding-google-font';
const CUSTOM_CSS_STYLE_ID = 'branding-custom-css';
const CSS_VARS_STYLE_ID = 'branding-css-vars';

function applyCssVariables(config: BrandingConfig) {
  let styleEl = document.getElementById(CSS_VARS_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = CSS_VARS_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = generateCssVariables(config);
}

function applyGoogleFont(fontFamily: string | null | undefined) {
  const existing = document.getElementById(GOOGLE_FONTS_LINK_ID);
  if (!fontFamily || fontFamily === 'Inter') {
    existing?.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
  if (existing instanceof HTMLLinkElement && existing.href === href) return;
  existing?.remove();
  const link = document.createElement('link');
  link.id = GOOGLE_FONTS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function applyCustomCss(css: string | null | undefined) {
  const existing = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (!css) {
    existing?.remove();
    return;
  }
  let styleEl = existing as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = CUSTOM_CSS_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

export function BrandingProvider({ brandId, children }: { brandId?: string; children: ReactNode }) {
  const [config, setConfig] = useState<BrandingConfig>(getDefaultBranding());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!brandId) {
      applyCssVariables(getDefaultBranding());
      setIsLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchBranding() {
      try {
        const res = await fetch(`/api/brands/${brandId}/whitelabel`);
        if (!res.ok) throw new Error('Failed to fetch branding');
        const data = await res.json();
        if (cancelled) return;

        const fetched: BrandingConfig = data.config ?? {};
        const merged = { ...getDefaultBranding(), ...fetched };
        setConfig(merged);

        applyCssVariables(merged);
        applyGoogleFont(merged.font_family);
        applyCustomCss(merged.custom_css);
      } catch (err) {
        console.error('Branding fetch error:', err);
        applyCssVariables(getDefaultBranding());
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    fetchBranding();
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return <BrandingContext.Provider value={{ ...config, isLoaded }}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
