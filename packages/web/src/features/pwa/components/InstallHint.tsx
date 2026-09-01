import { useState } from 'react';
import { Share } from 'lucide-react';
import { t } from '../../../lib/i18n.js';

const DISMISS_KEY = 'smart-wallet:pwa:install-hint-dismissed:v1';

const isIosSafari = (): boolean => {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; disambiguate via touch points
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const isWebkit = /WebKit/i.test(ua);
  // Chrome / Firefox / Edge / Opera on iOS are still WebKit but cannot "Add to Home Screen"
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
  return isWebkit && !isOtherIosBrowser;
};

const isStandalone = (): boolean => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
};

const shouldShow = (): boolean => {
  if (isStandalone() || !isIosSafari()) return false;
  try {
    return localStorage.getItem(DISMISS_KEY) !== '1';
  } catch {
    return false;
  }
};

/**
 * iOS-Safari-only hint pointing at Share → "Agregar a la pantalla de inicio".
 * Once dismissed, a persisted `localStorage` flag keeps it gone forever. Never
 * rendered in standalone mode or on non-iOS / non-Safari browsers.
 */
export const InstallHint = () => {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable — hide for this session anyway
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t.pwa.installHint}
      className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex items-start gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-lg"
    >
      <Share className="mt-0.5 size-5 shrink-0" />
      <p className="flex-1 text-sm leading-snug">{t.pwa.installHint}</p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 font-mono text-xs uppercase tracking-caption text-background/70 transition-colors hover:text-background"
      >
        {t.pwa.installDismiss}
      </button>
    </div>
  );
};
