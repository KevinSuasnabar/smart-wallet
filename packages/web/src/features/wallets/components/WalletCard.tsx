import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/card.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import type { WalletResponseDTO } from '@smart-wallet/shared-types';

interface WalletCardProps {
  wallet: WalletResponseDTO;
}

export const WalletCard = ({ wallet }: WalletCardProps) => (
  <Link to={routes.walletDetail(wallet.walletId)} className="block">
    <Card className="hover:bg-accent transition-colors min-h-[44px]">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{wallet.name}</p>
          <p className="text-xs text-muted-foreground">{wallet.currency}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums">
          {formatCurrency(wallet.balance, wallet.currency)}
        </p>
      </CardContent>
    </Card>
  </Link>
);
