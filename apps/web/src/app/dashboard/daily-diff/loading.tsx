import { Skeleton } from '@/components/ui/skeleton';

export default function DailyDiffLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border p-4">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
