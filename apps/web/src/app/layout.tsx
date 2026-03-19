import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { AppShell } from '@/components/app-shell';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'QuadBot — AI Marketing Autopilot',
  description: 'AI-powered marketing automation that observes, recommends, and acts on your behalf.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  viewport: { width: 'device-width', initialScale: 1 },
  themeColor: '#0f0f14',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
