import type { Currency } from '@smart-wallet/shared-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';

interface CurrencySelectProps {
  value: Currency | undefined;
  onChange: (value: Currency) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

export const CurrencySelect = ({
  value,
  onChange,
  disabled,
  id,
  placeholder,
}: CurrencySelectProps) => (
  <Select
    {...(value !== undefined ? { value } : {})}
    onValueChange={(v) => { onChange(v as Currency); }}
    {...(disabled !== undefined ? { disabled } : {})}
  >
    <SelectTrigger id={id}>
      <SelectValue placeholder={placeholder ?? 'Seleccioná una moneda'} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="USD">USD (Dólar)</SelectItem>
      <SelectItem value="PEN">PEN (Sol)</SelectItem>
    </SelectContent>
  </Select>
);
