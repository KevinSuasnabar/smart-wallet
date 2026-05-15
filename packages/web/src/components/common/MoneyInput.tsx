import { forwardRef } from 'react';
import { Input } from '../ui/input.js';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Normalize a decimal string to the `^\d+\.\d{2}$` shape the API contract
 * expects. Examples:
 *   ""        → ""
 *   "100"     → "100.00"
 *   "100."    → "100.00"
 *   "100.5"   → "100.50"
 *   ".5"      → "0.50"
 *   "100.55"  → "100.55"  (unchanged)
 */
const normalizeAmount = (value: string): string => {
  if (value === '') return '';
  const withLeadingZero = value.startsWith('.') ? `0${value}` : value;
  const [intPart = '0', decPart = ''] = withLeadingZero.split('.');
  const normalizedDec = decPart.padEnd(2, '0').slice(0, 2);
  return `${intPart}.${normalizedDec}`;
};

/**
 * Decimal money input. Allows free typing — digits, an optional single
 * decimal point, and up to 2 decimal places. On blur, the value is
 * normalized to the API's "exactly 2 decimal places" contract, so a user
 * can type "100" and have it become "100.00" automatically. The form's
 * Zod resolver validates the normalized value.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, onBlur, disabled, placeholder, ...rest }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty, digits, single decimal point, max 2 decimals
      const sanitized = raw.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] !== undefined && parts[1].length > 2) return;
      onChange(sanitized);
    };

    const handleBlur = () => {
      const normalized = normalizeAmount(value);
      if (normalized !== value) {
        onChange(normalized);
      }
      onBlur?.();
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled ?? false}
        placeholder={placeholder ?? '0.00'}
        className="text-base font-medium tabular-nums"
        {...rest}
      />
    );
  },
);

MoneyInput.displayName = 'MoneyInput';
