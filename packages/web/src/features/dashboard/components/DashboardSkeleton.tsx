import { Skeleton } from '../../../components/ui/skeleton.js';

export const DashboardSkeleton = () => (
  <div className="flex flex-col gap-5">
    <Skeleton className="h-[140px] w-full rounded-block" />
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Skeleton className="h-[100px] w-full rounded-block" />
      <Skeleton className="h-[100px] w-full rounded-block" />
      <Skeleton className="h-[100px] w-full rounded-block" />
    </div>
    <Skeleton className="h-[180px] w-full rounded-block" />
  </div>
);
