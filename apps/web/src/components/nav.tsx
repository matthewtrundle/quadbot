import Link from 'next/link';
import { Bot, Building2, LayoutDashboard, CalendarClock, Download, DollarSign } from 'lucide-react';

export function Nav() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Bot className="h-6 w-6" />
          <span className="text-lg font-bold">Quadbot</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/dashboard/daily-diff"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium pl-10 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <CalendarClock className="h-4 w-4" />
            Daily Diff
          </Link>
          <Link
            href="/brands"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Building2 className="h-4 w-4" />
            Brands
          </Link>
          <Link
            href="/onboarding/gsc-import"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium pl-10 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            Google Import
          </Link>
          <Link
            href="/dashboard/usage"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <DollarSign className="h-4 w-4" />
            Usage & Costs
          </Link>
        </nav>
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">Quadbot v2 - Intelligence Layer</p>
        </div>
      </div>
    </aside>
  );
}
