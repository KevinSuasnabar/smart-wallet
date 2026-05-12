import { Skeleton } from '../../../components/ui/skeleton.js';

export const WalletsListSkeleton = () => (
  <div className="flex flex-col gap-3">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
    ))}
  </div>
);
