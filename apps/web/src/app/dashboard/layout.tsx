'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity } from 'lucide-react';

const tabs = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/daily-diff', label: 'Daily Diff' },
  { href: '/dashboard/improvements', label: 'Improvements' },
  { href: '/dashboard/usage', label: 'Usage & Costs' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-8">
      {/* Premium header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered brand intelligence at a glance
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          <span className="text-xs font-medium text-success">Systems Online</span>
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-border/50">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors hover:text-foreground ${
                isActive
                  ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
