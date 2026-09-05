import { useEffect, useRef, useState } from 'react';

/** Resisted travel (px) the finger must reach before a release triggers a refresh. */
export const PULL_THRESHOLD = 72;

/** Asymptote of the rubber-band curve: the pull can never exceed this. */
const MAX_PULL = 120;

/** Travel absorbed before the gesture is claimed, so taps and flicks never arm it. */
const DIRECTION_SLOP = 8;

/** Floor for the spinner so a warm cache doesn't make it flash and vanish. */
const MIN_REFRESH_MS = 450;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown>;
  enabled?: boolean;
}

interface PullToRefreshState {
  /** Current resisted travel in px (0 when idle). */
  pull: number;
  /** True while the finger owns the gesture — render without transitions. */
  dragging: boolean;
  /** True while `onRefresh` is in flight. */
  refreshing: boolean;
}

/**
 * Radix locks body scroll while a Dialog/Sheet is open. Pulling then would drag
 * the page behind the overlay, so the gesture stays disabled for that duration.
 */
const isScrollLocked = () =>
  document.body.hasAttribute('data-scroll-locked') ||
  document.querySelector('[role="dialog"][data-state="open"]') !== null;

/** Linear near zero, asymptotic towards `MAX_PULL` — the usual rubber-band feel. */
const resist = (distance: number) => MAX_PULL * (1 - Math.exp(-distance / MAX_PULL));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pull-to-refresh gesture for the mobile shell.
 *
 * The app scrolls the document (no inner scroll container), so the listeners sit
 * on `window` and the gesture only arms at `scrollY === 0`. `touchmove` is bound
 * non-passive because claiming the gesture requires `preventDefault()` — without
 * it iOS rubber-bands the whole document underneath the indicator.
 *
 * Touch-only by design: pointer devices already have the browser's reload.
 */
export const usePullToRefresh = ({
  onRefresh,
  enabled = true,
}: UsePullToRefreshOptions): PullToRefreshState => {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Kept in a ref so a changing callback identity never re-binds the listeners.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const engagedRef = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const release = () => {
      startRef.current = null;
      engagedRef.current = false;
      pullRef.current = 0;
      setPull(0);
      setDragging(false);
    };

    const handleStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (window.scrollY > 0 || isScrollLocked()) return;

      const touch = event.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
      engagedRef.current = false;
    };

    const handleMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start || refreshingRef.current) return;

      const touch = event.touches[0];
      if (!touch) return;

      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;

      if (!engagedRef.current) {
        // Sideways swipe or an upward scroll: hand the gesture back to the page.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
          if (Math.abs(dx) > DIRECTION_SLOP || dy < -DIRECTION_SLOP) startRef.current = null;
          return;
        }
        if (dy < DIRECTION_SLOP) return;
        if (window.scrollY > 0) {
          startRef.current = null;
          return;
        }
        engagedRef.current = true;
        setDragging(true);
      }

      if (event.cancelable) event.preventDefault();

      const next = resist(dy - DIRECTION_SLOP);
      pullRef.current = next;
      setPull(next);
    };

    const handleEnd = () => {
      if (!engagedRef.current) {
        startRef.current = null;
        return;
      }

      const shouldRefresh = pullRef.current >= PULL_THRESHOLD;
      startRef.current = null;
      engagedRef.current = false;
      setDragging(false);

      if (!shouldRefresh) {
        pullRef.current = 0;
        setPull(0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      setPull(PULL_THRESHOLD);

      void Promise.all([
        Promise.resolve(onRefreshRef.current()).catch(() => undefined),
        wait(MIN_REFRESH_MS),
      ]).finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        pullRef.current = 0;
        setPull(0);
      });
    };

    window.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
      release();
    };
  }, [enabled]);

  return { pull, dragging, refreshing };
};
