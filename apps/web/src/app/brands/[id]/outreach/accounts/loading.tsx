import { Skeleton } from '@/components/ui/skeleton';

export default function AccountsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
