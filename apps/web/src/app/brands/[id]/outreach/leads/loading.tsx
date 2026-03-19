import { Skeleton } from '@/components/ui/skeleton';

export default function LeadsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  );
}
