import type { Currency } from '@smart-wallet/shared-types';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { formatCurrency } from '../../../lib/currency.js';
import { abs } from '../../../lib/decimal.js';
import { t } from '../../../lib/i18n.js';

interface MonthlyStatsCardProps {
  currency: Currency;
  income: string;
  expenses: string;
  net: string;
}

export const MonthlyStatsCard = ({
  currency,
  income,
  expenses,
  net,
}: MonthlyStatsCardProps) => {
  const negative = net.startsWith('-');
  const sign = negative ? '−' : '+';
  const netAbs = abs(net);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <ColorBlock tone="mint" className="p-5 md:p-6">
        <Eyebrow>{t.dashboard.monthlyIncome}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display md:text-3xl">
          {formatCurrency(income, currency)}
        </p>
      </ColorBlock>
      <ColorBlock tone="coral" className="p-5 md:p-6">
        <Eyebrow>{t.dashboard.monthlyExpenses}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display md:text-3xl">
          {formatCurrency(expenses, currency)}
        </p>
      </ColorBlock>
      <ColorBlock tone={negative ? 'pink' : 'lime'} className="p-5 md:p-6">
        <Eyebrow>{t.dashboard.monthlyNet}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display md:text-3xl">
          {sign}
          {formatCurrency(netAbs, currency)}
        </p>
      </ColorBlock>
    </div>
  );
};
