import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">Mission Control</h1>
      </div>

      <nav className="flex gap-4 border-b pb-2">
        <Link href="/dashboard" className="text-sm font-medium hover:text-primary">
          Overview
        </Link>
        <Link href="/dashboard/daily-diff" className="text-sm font-medium hover:text-primary">
          Daily Diff
        </Link>
      </nav>

      {children}
    </div>
  );
}
