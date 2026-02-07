import Link from 'next/link';
import { Building2, LayoutDashboard, CalendarClock, Download, DollarSign, Settings, Sparkles } from 'lucide-react';

export function Nav() {
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
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Core
          </p>
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-primary"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/dashboard/daily-diff"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <CalendarClock className="h-4 w-4" />
            Daily Diff
          </Link>
          <Link
            href="/brands"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-primary"
          >
            <Building2 className="h-4 w-4" />
            Brands
          </Link>

          <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Setup
          </p>
          <Link
            href="/onboarding/gsc-import"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            Google Import
          </Link>
          <Link
            href="/dashboard/usage"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <DollarSign className="h-4 w-4" />
            Usage & Costs
          </Link>
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>

        {/* Footer with version */}
        <div className="border-t border-border/50 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-quad-cyan" />
            <span>QuadBot v2 — Intelligence Layer</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
