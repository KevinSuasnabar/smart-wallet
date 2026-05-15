/**
 * Normalize a decimal-money string to the API's strict `^\d+\.\d{2}$` shape
 * (always 2 decimal places). Empty string stays empty.
 *
 * Examples:
 *   ""        → ""
 *   "100"     → "100.00"
 *   "100."    → "100.00"
 *   "100.5"   → "100.50"
 *   ".5"      → "0.50"
 *   "100.55"  → "100.55"  (unchanged)
 */
export const normalizeAmount = (value: string): string => {
  if (value === '') return '';
  const withLeadingZero = value.startsWith('.') ? `0${value}` : value;
  const [intPart = '0', decPart = ''] = withLeadingZero.split('.');
  const normalizedDec = decPart.padEnd(2, '0').slice(0, 2);
  return `${intPart}.${normalizedDec}`;
};

/**
 * Loose regex that accepts both integers and decimals with 1-2 places.
 * The TransactionForm uses this so the submit button enables while the
 * user is still typing "100" (not yet "100.00"). The value is normalized
 * via `normalizeAmount` before being sent to the API, where the strict
 * 2-decimal regex applies.
 */
export const LOOSE_DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
