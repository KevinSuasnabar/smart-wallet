import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletSelectProps {
  wallets: WalletResponseDTO[];
  value: string;
  onChange: (walletId: string) => void;
  disabled?: boolean;
  id?: string;
}

export const WalletSelect = ({
  wallets,
  value,
  onChange,
  disabled,
  id,
}: WalletSelectProps) => (
  <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
    <SelectTrigger id={id}>
      <SelectValue placeholder="Elegí una billetera" />
    </SelectTrigger>
    <SelectContent>
      {wallets.map((w) => (
        <SelectItem key={w.walletId} value={w.walletId}>
          {w.name} ({w.currency})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
