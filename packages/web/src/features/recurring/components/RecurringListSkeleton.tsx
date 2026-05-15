import { Skeleton } from '../../../components/ui/skeleton.js';

export const RecurringListSkeleton = () => (
  <div className="flex flex-col gap-3">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
    ))}
  </div>
);
