import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { t } from '../../../lib/i18n.js';

/**
 * Global chrome strip shown whenever the device is offline. Sits above `<main>`
 * in normal flow (see `AppLayout`) so it pushes content down rather than
 * overlapping. Navy chrome treatment mirrors `BottomTabBar`.
 */
export const OfflineBanner = () => {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-foreground px-4 py-2 pt-safe font-mono text-xs uppercase tracking-caption text-background"
    >
      <WifiOff className="size-3.5" />
      <span>{t.pwa.offline}</span>
    </div>
  );
};
