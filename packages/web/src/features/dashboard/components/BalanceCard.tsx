import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Currency } from '@smart-wallet/shared-types';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Button } from '../../../components/ui/button.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import type { CurrencyBalance } from '../lib/aggregation.js';

interface BalanceCardProps {
  totals: CurrencyBalance[];
}

export const BalanceCard = ({ totals }: BalanceCardProps) => {
  if (totals.length === 0) {
    return (
      <ColorBlock tone="cream" className="flex flex-col items-start gap-3">
        <Eyebrow>{t.dashboard.totalBalance}</Eyebrow>
        <p className="text-base text-foreground/70">
          {t.dashboard.noWallets}
        </p>
        <Button asChild size="sm" className="gap-1">
          <Link to={routes.walletsNew}>
            <Plus className="size-4" />
            {t.wallets.createCta}
          </Link>
        </Button>
      </ColorBlock>
    );
  }

  return (
    <ColorBlock tone="navy">
      <Eyebrow className="text-white/60">{t.dashboard.totalBalance}</Eyebrow>
      <div
        className={`mt-4 grid gap-5 ${
          totals.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
        }`}
      >
        {totals.map(({ currency, balance }) => (
          <div key={currency} className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-caption text-white/60">
              {currency}
            </span>
            <span className="text-3xl font-bold leading-none tracking-display text-white md:text-4xl">
              {formatCurrency(balance, currency as Currency)}
            </span>
          </div>
        ))}
      </div>
    </ColorBlock>
  );
};
