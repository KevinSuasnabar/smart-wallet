import { forwardRef } from 'react';
import { Input } from '../ui/input.js';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Decimal money input. Accepts digits and up to 2 decimal places.
 * Strips invalid characters on the fly — does NOT trim or transform on blur.
 * Domain validation (>0, currency-specific) happens at Zod resolver level.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, disabled, placeholder, ...rest }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty, digits, single decimal point, max 2 decimals
      const sanitized = raw.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] !== undefined && parts[1].length > 2) return;
      onChange(sanitized);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        disabled={disabled ?? false}
        placeholder={placeholder ?? '0.00'}
        className="text-base font-medium tabular-nums"
        {...rest}
      />
    );
  },
);

MoneyInput.displayName = 'MoneyInput';
