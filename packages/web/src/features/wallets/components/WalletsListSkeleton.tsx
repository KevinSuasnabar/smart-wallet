import { Skeleton } from '../../../components/ui/skeleton.js';

export const WalletsListSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-[180px] w-full rounded-block" />
    ))}
  </div>
);
