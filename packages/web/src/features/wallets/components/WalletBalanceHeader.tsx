import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { formatCurrency } from '../../../lib/currency.js';
import { t } from '../../../lib/i18n.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletBalanceHeaderProps {
  wallet: WalletResponseDTO;
}

/**
 * The balance is the hero of the detail page — it rides the navy color block,
 * the one inverse surface in the system, so the number reads like a poster.
 */
export const WalletBalanceHeader = ({ wallet }: WalletBalanceHeaderProps) => (
  <ColorBlock tone="navy" className="text-center">
    <Eyebrow className="text-white/55">{wallet.name}</Eyebrow>
    <p className="mt-3 text-4xl font-bold tabular-nums tracking-display md:text-5xl">
      {formatCurrency(wallet.balance, wallet.currency)}
    </p>
    <p className="mt-3 font-mono text-[11px] uppercase tracking-caption text-white/55">
      {t.wallets.balance} · {wallet.currency}
    </p>
  </ColorBlock>
);
