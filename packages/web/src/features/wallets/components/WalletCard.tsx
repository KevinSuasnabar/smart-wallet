import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletCardProps {
  wallet: WalletResponseDTO;
}

/**
 * A wallet as an editorial list row — hairline frame, rounded.md corners,
 * the balance set large and tabular. No shadow; hover is a soft wash.
 */
export const WalletCard = ({ wallet }: WalletCardProps) => (
  <Link
    to={routes.walletDetail(wallet.walletId)}
    className="group flex items-center gap-4 rounded-md border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent"
  >
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold tracking-tightest">{wallet.name}</p>
      <Eyebrow>{wallet.currency}</Eyebrow>
    </div>
    <p className="text-lg font-bold tabular-nums tracking-tightest">
      {formatCurrency(wallet.balance, wallet.currency)}
    </p>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
  </Link>
);
