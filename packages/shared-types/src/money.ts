import { z } from 'zod';
import type { Currency } from './currencies.js';
import { currencyDecimals } from './currencies.js';

/**
 * Converts a decimal string (e.g. "12.34") to integer cents (e.g. 1234).
 *
 * Rules:
 * - Must not have more decimal places than the currency allows (2 for USD/PEN).
 * - Must not be negative.
 * - Must be a valid finite number.
 *
 * Throws on any violation. Zod schemas wrap this in a .refine() call so the
 * error surfaces as a validation failure before reaching the domain.
 *
 * The math avoids floating-point by doing integer string arithmetic:
 * "12.34" → intPart="12", fracPart="34" → 12*100 + 34 = 1234
 */
export function decimalStringToCents(value: string, currency: Currency): number {
  const scale = currencyDecimals[currency];
  const dotIndex = value.indexOf('.');
  const intPartStr = dotIndex === -1 ? value : value.slice(0, dotIndex);
  const fracPartStr = dotIndex === -1 ? '' : value.slice(dotIndex + 1);

  if (fracPartStr.length > scale) {
    throw new Error(
      `Too many decimal places for ${currency}: got ${fracPartStr.length}, max ${scale}`,
    );
  }

  // Must be non-negative
  if (value.startsWith('-')) {
    throw new Error(`Amount must not be negative: "${value}"`);
  }

  const intAbs = Number(intPartStr);
  if (!Number.isFinite(intAbs) || isNaN(intAbs)) {
    throw new Error(`Invalid decimal amount: "${value}"`);
  }

  const fracPadded = fracPartStr.padEnd(scale, '0');
  const fracVal = fracPadded.length > 0 ? Number(fracPadded) : 0;

  return intAbs * (10 ** scale) + fracVal;
}

/**
 * Converts integer cents (e.g. 1234) to a decimal string (e.g. "12.34").
 *
 * Always produces exactly `scale` decimal places (e.g. "5.00" not "5").
 * Supports negative values (e.g. -350 → "-3.50").
 */
export function centsToDecimalString(cents: number, currency: Currency): string {
  const scale = currencyDecimals[currency];
  const multiplier = 10 ** scale;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / multiplier);
  const fracPart = (abs % multiplier).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Zod schema for validating decimal amount strings at the API boundary.
 *
 * Accepts: non-negative decimal strings with exactly 2 decimal places (e.g. "12.34").
 * Does NOT check for > 0 — that is enforced by Money.create() in the domain.
 * No `.transform()` — stays as string; currency-aware conversion to cents
 * happens in the handler after loading the wallet's currency.
 *
 * REQ-MNY-02, REQ-MNY-03
 */
export const zDecimalString = z
  .string()
  .regex(/^\d+\.\d{2}$/, 'Amount must be a decimal with exactly 2 decimal places (e.g. "12.34")');
