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
        className="flex border-b border-border last:border-b-0"
      >
        <span className="my-3 w-1.5 shrink-0 self-stretch rounded-sm bg-muted" />
        <div className="flex flex-1 items-center justify-between gap-3 py-4 pl-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded-sm" />
            <Skeleton className="h-3 w-20 rounded-sm" />
          </div>
          <Skeleton className="h-6 w-24 rounded-sm" />
        </div>
      </div>
    ))}
  </div>
);
