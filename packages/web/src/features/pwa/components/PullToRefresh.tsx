import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { CSSProperties, PropsWithChildren } from 'react';
import { PULL_THRESHOLD, usePullToRefresh } from '../hooks/usePullToRefresh.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { cn } from '../../../lib/utils.js';
import { t } from '../../../lib/i18n.js';

/** Diameter of the indicator puck, used to park it just above the content edge. */
const PUCK_SIZE = 40;

/**
 * Wraps the app canvas with a native-feeling pull-to-refresh: dragging down from
 * the top of the page refetches every query currently mounted on screen.
 *
 * The whole subtree translates with the finger, so the indicator reads as part of
 * the page rather than an overlay. Transforms are dropped entirely when idle —
 * a live `transform` makes this element a containing block for `position: fixed`
 * descendants, which would break any fixed chrome rendered inside the canvas.
 *
 * Disabled while offline: a refetch would only surface network errors.
 */
export const PullToRefresh = ({ children }: PropsWithChildren) => {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();

  const { pull, dragging, refreshing } = usePullToRefresh({
    enabled: online,
    onRefresh: () => queryClient.refetchQueries({ type: 'active' }),
  });

  const offset = refreshing ? PULL_THRESHOLD : pull;
  const idle = offset === 0;
  const progress = Math.min(1, offset / PULL_THRESHOLD);
  const settle = !dragging && 'transition-[transform,opacity] duration-300 ease-out';

  const shift = (y: number): CSSProperties =>
    idle ? { transform: 'none' } : { transform: `translate3d(0, ${y}px, 0)` };

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center',
          settle,
        )}
        style={{ ...shift(offset - PUCK_SIZE), opacity: progress }}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
          <RefreshCw
            className={cn('size-4', refreshing && 'animate-spin')}
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          />
        </span>
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col', settle)} style={shift(offset)}>
        {children}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? t.pwa.refreshing : ''}
      </span>
    </div>
  );
};
