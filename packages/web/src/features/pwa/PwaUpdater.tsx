import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { t } from '../../lib/i18n.js';

/**
 * Registers the service worker and surfaces its update lifecycle.
 *
 * - `onNeedRefresh`: a new build is waiting → persistent toast with a "Recargar"
 *   action that activates the waiting worker and reloads onto the new build.
 * - `onOfflineReady`: silent. A single-user app cannot act on "ready offline".
 *
 * Renders nothing — purely a side-effect component, mounted in `Providers`.
 */
export const PwaUpdater = () => {
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      toast(t.pwa.updateAvailable, {
        duration: Infinity,
        action: {
          label: t.pwa.updateAction,
          onClick: () => void updateServiceWorker(true),
        },
      });
    },
    onOfflineReady() {
      // no-op: nothing for the user to do
    },
  });

  return null;
};
