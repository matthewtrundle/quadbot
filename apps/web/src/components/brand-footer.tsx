'use client';

import { useBranding } from '@/components/branding-provider';

export function BrandFooter() {
  const branding = useBranding();

  if (!branding.isLoaded) return null;

  const showPoweredBy = !branding.hide_powered_by;
  const hasFooterText = !!branding.footer_text;

  if (!showPoweredBy && !hasFooterText) return null;

  return (
    <footer className="w-full border-t border-white/10 px-6 py-4 text-center text-sm text-[var(--brand-fg)]/60">
      {hasFooterText && <p>{branding.footer_text}</p>}
      {showPoweredBy && (
        <p className={hasFooterText ? 'mt-1' : ''}>
          Powered by{' '}
          <a
            href="https://quadbot.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--brand-primary)] hover:underline"
          >
            QuadBot
          </a>
        </p>
      )}
    </footer>
  );
}
