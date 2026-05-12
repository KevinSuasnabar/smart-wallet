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
}

export const CurrencySelect = ({ value, onChange, disabled }: CurrencySelectProps) => (
  <Select
    {...(value !== undefined ? { value } : {})}
    onValueChange={(v) => { onChange(v as Currency); }}
    {...(disabled !== undefined ? { disabled } : {})}
  >
    <SelectTrigger>
      <SelectValue placeholder="Seleccioná una moneda" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="USD">USD (Dólar)</SelectItem>
      <SelectItem value="PEN">PEN (Sol)</SelectItem>
    </SelectContent>
  </Select>
);
