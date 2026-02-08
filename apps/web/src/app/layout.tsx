import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quadbot',
  description: 'AI-powered brand management dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
        <Toaster theme="dark" richColors position="bottom-right" />
      </body>
    </html>
  );
}
