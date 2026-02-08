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
      <main className={`min-h-screen p-8 ${showNav ? 'ml-64' : ''}`}>{children}</main>
    </>
  );
}
