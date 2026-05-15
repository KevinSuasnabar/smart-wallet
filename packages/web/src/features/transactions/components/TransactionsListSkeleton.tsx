import { Skeleton } from '../../../components/ui/skeleton.js';

interface TransactionsListSkeletonProps {
  rows?: number;
}

export const TransactionsListSkeleton = ({
  rows = 5,
}: TransactionsListSkeletonProps) => (
  <div className="flex flex-col">
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className="flex items-center justify-between gap-3 border-b border-border py-3.5 last:border-b-0"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
        </div>
        <Skeleton className="h-5 w-20 rounded-sm" />
      </div>
    ))}
  </div>
);
