'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, CalendarClock, ChevronDown, Download, DollarSign, Settings, Sparkles, LogOut } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

/** Client-side user type with custom additional fields from better-auth config. */
type ClientUserWithBrand = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  brandId?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix: string;
  children?: NavItem[];
};

const coreItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    matchPrefix: '/dashboard',
    children: [
      { href: '/dashboard/daily-diff', label: 'Daily Diff', icon: CalendarClock, matchPrefix: '/dashboard/daily-diff' },
    ],
  },
  { href: '/brands', label: 'Brands', icon: Building2, matchPrefix: '/brands' },
];

const setupItems: NavItem[] = [
  { href: '/onboarding/gsc-import', label: 'Google Import', icon: Download, matchPrefix: '/onboarding' },
  { href: '/dashboard/usage', label: 'Usage & Costs', icon: DollarSign, matchPrefix: '/dashboard/usage' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, matchPrefix: '/dashboard/settings' },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix === '/dashboard') {
    return (
      pathname === '/dashboard' ||
      (pathname.startsWith('/dashboard') &&
        !pathname.startsWith('/dashboard/daily-diff') &&
        !pathname.startsWith('/dashboard/usage') &&
        !pathname.startsWith('/dashboard/settings') &&
        !pathname.startsWith('/dashboard/improvements'))
    );
  }
  return pathname.startsWith(item.matchPrefix);
}

function NavLink({ item, pathname, indent }: { item: NavItem; pathname: string; indent?: boolean }) {
  const isActive = isItemActive(item, pathname);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        indent ? 'pl-10' : ''
      } ${
        isActive
          ? 'bg-secondary text-primary border-l-2 border-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const isParentActive = isItemActive(item, pathname);
  const isChildActive = item.children?.some((child) => pathname.startsWith(child.matchPrefix)) ?? false;
  const [open, setOpen] = useState(isParentActive || isChildActive);

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={item.href}
          className={`flex flex-1 items-center gap-3 rounded-md rounded-r-none px-3 py-2.5 text-sm font-medium transition-colors ${
            isParentActive
              ? 'bg-secondary text-primary border-l-2 border-primary'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
        <button
          onClick={() => setOpen((prev) => !prev)}
          className={`rounded-md rounded-l-none px-2 py-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${
            isParentActive ? 'bg-secondary' : ''
          }`}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </button>
      </div>
      {open && item.children && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavLink key={child.href} item={child} pathname={pathname} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border/50 bg-card/80 backdrop-blur-sm">
      <div className="flex h-full flex-col">
        {/* Logo area with geometric cubes */}
        <div className="flex h-16 items-center gap-3 border-b border-border/50 px-6">
          <div className="relative">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-quad-cyan" />
              <div className="h-2.5 w-2.5 rounded-sm bg-quad-purple" />
              <div className="h-2.5 w-2.5 rounded-sm bg-quad-blue" />
              <div className="h-2.5 w-2.5 rounded-sm bg-quad-pink" />
            </div>
          </div>
          <span className="text-lg font-bold tracking-tight holographic">QuadBot</span>
          <div className="ml-auto">
            <NotificationBell brandId={(session?.user as ClientUserWithBrand | undefined)?.brandId || null} />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Core
          </p>
          {coreItems.map((item) =>
            item.children ? (
              <NavGroup key={item.href} item={item} pathname={pathname} />
            ) : (
              <NavLink key={item.href} item={item} pathname={pathname} />
            )
          )}

          <div className="my-4 mx-3 border-t border-border/30" />
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Setup
          </p>
          {setupItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Footer with user + version */}
        <div className="border-t border-border/50 p-4 space-y-3">
          {session?.user && (
            <div className="flex items-center justify-between rounded-lg p-2 -mx-2 transition-colors hover:bg-secondary/50">
              <div className="flex items-center gap-2 min-w-0">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-7 w-7 rounded-full flex-shrink-0 ring-1 ring-border/50"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-quad-cyan/20 flex items-center justify-center flex-shrink-0 ring-1 ring-border/50">
                    <span className="text-xs font-medium text-quad-cyan">
                      {session.user.name?.charAt(0) || '?'}
                    </span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {session.user.name || session.user.email}
                </span>
              </div>
              <button
                onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login'; } } })}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-quad-cyan" />
              <span>QuadBot v2 — Intelligence Layer</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
