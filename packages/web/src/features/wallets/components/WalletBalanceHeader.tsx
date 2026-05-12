import { formatCurrency } from '../../../lib/currency.js';
import { t } from '../../../lib/i18n.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletBalanceHeaderProps {
  wallet: WalletResponseDTO;
}

export const WalletBalanceHeader = ({ wallet }: WalletBalanceHeaderProps) => (
  <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
    <p className="text-sm text-muted-foreground font-medium">{wallet.name}</p>
    <p className="text-4xl font-bold tabular-nums tracking-tight">
      {formatCurrency(wallet.balance, wallet.currency)}
    </p>
    <p className="text-xs text-muted-foreground">{t.wallets.balance} · {wallet.currency}</p>
  </div>
);
