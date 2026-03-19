'use client';

import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Nav } from './nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const showNav = pathname !== '/login' && !!session;

  return (
    <>
      {showNav && <Nav />}
      <main className={`min-h-screen px-4 py-6 sm:px-6 sm:py-8 ${showNav ? 'lg:ml-64 pt-16 lg:pt-8' : ''}`}>
        {children}
      </main>
    </>
  );
}
