import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { isWalletColor } from '@smart-wallet/shared-types';
import { ColorBlock, type ColorBlockTone } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletCardProps {
  wallet: WalletResponseDTO;
}

/**
 * A wallet as a pastel tile in the bento grid — the DESIGN.md "color block as
 * story section" pattern, scaled down to a card. The tone is the wallet's
 * own `color` attribute (chosen by the user); legacy wallets without a
 * stored color fall back to 'lime' (the mapper already handles that; the
 * runtime guard here is belt-and-suspenders).
 */
export const WalletCard = ({ wallet }: WalletCardProps) => {
  const tone: ColorBlockTone = isWalletColor(wallet.color)
    ? wallet.color
    : 'lime';

  return (
    <Link
      to={routes.walletDetail(wallet.walletId)}
      className="group block transition-transform active:scale-[0.99]"
    >
      <ColorBlock
        tone={tone}
        className="flex min-h-[180px] flex-col gap-6 transition-opacity group-hover:opacity-90"
      >
        <div className="flex items-start justify-between">
          <Eyebrow className="text-ink/55">{wallet.currency}</Eyebrow>
          <ArrowUpRight className="size-5 text-ink/45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <p className="text-3xl font-bold tabular-nums tracking-display md:text-4xl">
            {formatCurrency(wallet.balance, wallet.currency)}
          </p>
          <p className="text-sm font-medium tracking-tightest text-ink/75">
            {wallet.name}
          </p>
        </div>
      </ColorBlock>
    </Link>
  );
};
