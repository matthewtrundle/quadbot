import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { AppShell } from '@/components/app-shell';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quadbot',
  description: 'AI-powered brand management dashboard',
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
