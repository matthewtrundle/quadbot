'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Inbox', segment: 'inbox' },
  { label: 'Actions', segment: 'actions' },
  { label: 'Artifacts', segment: 'artifacts' },
  { label: 'Content', segment: 'content' },
  { label: 'Outreach', segment: 'outreach' },
  { label: 'Playbooks', segment: 'playbooks' },
  { label: 'Executions', segment: 'executions' },
  { label: 'Evaluation', segment: 'evaluation' },
  { label: 'Settings', segment: 'settings' },
];

export function BrandNav({ brandId }: { brandId: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 border-b overflow-x-auto scrollbar-none -mx-1 px-1"
      aria-label="Brand navigation"
    >
      {NAV_ITEMS.map(({ label, segment }) => {
        const href = `/brands/${brandId}/${segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={segment}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium transition-colors rounded-t-md border-b-2',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
