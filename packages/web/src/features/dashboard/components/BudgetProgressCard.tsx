import { Link } from 'react-router-dom';
import { PREDEFINED_CATEGORIES, type Currency, type WalletColor } from '@smart-wallet/shared-types';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { BudgetProgressBar } from '../../budgets/components/BudgetProgressBar.js';
import { useListBudgets } from '../../budgets/queries.js';
import { useCategories } from '../../categories/queries.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

const PREDEFINED_BY_ID: ReadonlyMap<string, { name: string; color: WalletColor }> = new Map(
  PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, { name: c.name, color: c.color }]),
);

interface BudgetProgressCardProps {
  currency: Currency;
}

export const BudgetProgressCard = ({ currency }: BudgetProgressCardProps) => {
  const { data } = useListBudgets();
  const { data: categoriesData } = useCategories();

  const items = (data?.items ?? []).filter((b) => b.currency === currency);
  if (items.length === 0) return null;

  const resolveLabel = (categoryId: string | undefined): string => {
    if (categoryId === undefined) return t.budgets.typeGlobal;
    const custom = categoriesData?.custom.find((c) => c.categoryId === categoryId);
    if (custom !== undefined) return custom.name;
    return PREDEFINED_BY_ID.get(categoryId)?.name ?? categoryId.slice(0, 8);
  };

  return (
    <ColorBlock tone="lilac">
      <div className="flex items-center justify-between">
        <Eyebrow>{t.dashboard.budgetsEyebrow}</Eyebrow>
        <Link
          to={routes.budgets}
          className="font-mono text-[11px] uppercase tracking-eyebrow text-ink/60 hover:text-ink"
        >
          {t.dashboard.budgetsSeeAll}
        </Link>
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {items.map((b) => {
          const pct =
            parseFloat(b.effectiveLimit) > 0
              ? Math.min((parseFloat(b.spent) / parseFloat(b.effectiveLimit)) * 100, 100)
              : 0;

          return (
            <li key={b.budgetId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">
                  {resolveLabel(b.categoryId)}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink/60">{Math.round(pct)}%</span>
              </div>
              <BudgetProgressBar spent={b.spent} effectiveLimit={b.effectiveLimit} />
              <div className="flex justify-between font-mono text-[11px] text-ink/60">
                <span>{formatCurrency(b.spent, b.currency)}</span>
                <span>{formatCurrency(b.effectiveLimit, b.currency)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </ColorBlock>
  );
};
