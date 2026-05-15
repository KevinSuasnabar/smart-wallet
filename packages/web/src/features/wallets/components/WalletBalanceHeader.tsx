import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { formatCurrency } from '../../../lib/currency.js';
import { t } from '../../../lib/i18n.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletBalanceHeaderProps {
  wallet: WalletResponseDTO;
}

/**
 * The balance is the hero of the detail page — a full-bleed navy poster.
 * The number runs at display-xl scale so it dominates the viewport and the
 * meta (name, currency, label) sits as mono captions around it.
 */
export const WalletBalanceHeader = ({ wallet }: WalletBalanceHeaderProps) => (
  <ColorBlock
    tone="navy"
    className="flex flex-col gap-10 px-6 py-10 md:px-10 md:py-14"
  >
    <div className="flex items-center justify-between">
      <Eyebrow className="text-white/55">{wallet.name}</Eyebrow>
      <Eyebrow className="text-white/55">{wallet.currency}</Eyebrow>
    </div>

    <p className="text-5xl font-bold leading-none tabular-nums tracking-display md:text-7xl">
      {formatCurrency(wallet.balance, wallet.currency)}
    </p>

    <p className="font-mono text-[11px] uppercase tracking-caption text-white/55">
      {t.wallets.balance}
    </p>
  </ColorBlock>
);
