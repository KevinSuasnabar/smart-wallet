import { forwardRef } from 'react';
import { Input } from '../ui/input.js';
import { normalizeAmount } from '../../lib/amount.js';

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
 * Decimal money input. Allows free typing — digits, an optional single
 * decimal point, and up to 2 decimal places. On blur, the value is
 * normalized to the API's "exactly 2 decimal places" contract via
 * `normalizeAmount`, so a user can type "100" and have it become
 * "100.00" automatically.
 *
 * The form's Zod resolver uses a loose regex that accepts both shapes
 * (e.g. "100" and "100.00") so the submit button enables while the
 * user is still typing; final normalization to the API contract shape
 * happens in the form's submit handler.
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
