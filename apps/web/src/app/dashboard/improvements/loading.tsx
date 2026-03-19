import { Skeleton } from '@/components/ui/skeleton';

export default function ImprovementsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-36" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
