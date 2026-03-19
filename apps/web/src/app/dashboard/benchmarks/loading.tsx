import { Skeleton } from '@/components/ui/skeleton';

export default function BenchmarksLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-36" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border p-4">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
