import { useEffect, useState } from 'react';
import type { Currency } from '@smart-wallet/shared-types';
import { useAuth } from '../auth/useAuth.js';

const VALID: readonly Currency[] = ['USD', 'PEN'] as const;

const keyFor = (sub: string): string =>
  `smart-wallet:preferred-currency:${sub}`;

const isCurrency = (v: unknown): v is Currency =>
  typeof v === 'string' && (VALID as readonly string[]).includes(v);

const readFromStorage = (sub: string): Currency | null => {
  try {
    const raw = localStorage.getItem(keyFor(sub));
    return isCurrency(raw) ? raw : null;
  } catch {
    return null;
  }
};

const writeToStorage = (sub: string, currency: Currency): void => {
  try {
    localStorage.setItem(keyFor(sub), currency);
  } catch {
    // Safari private mode or embedded webview — degrade silently.
  }
};

/**
 * Reads and writes the user's preferred wallet currency, scoped by Cognito
 * sub. localStorage failures degrade silently (the UI keeps working, the
 * preference just doesn't persist).
 *
 * Re-syncs when `sub` changes so a logout/login on the same tab doesn't leak
 * the previous user's preference into the form.
 */
export const usePreferredCurrency = (): {
  currency: Currency | null;
  setCurrency: (next: Currency) => void;
} => {
  const { user } = useAuth();
  const sub = user?.sub ?? '';

  const [currency, setCurrencyState] = useState<Currency | null>(() =>
    sub ? readFromStorage(sub) : null,
  );

  useEffect(() => {
    setCurrencyState(sub ? readFromStorage(sub) : null);
  }, [sub]);

  const setCurrency = (next: Currency): void => {
    if (!sub) return;
    writeToStorage(sub, next);
    setCurrencyState(next);
  };

  return { currency, setCurrency };
};
