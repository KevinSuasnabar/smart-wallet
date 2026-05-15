import {
  PREDEFINED_CATEGORIES,
  type Currency,
  type WalletColor,
} from '@smart-wallet/shared-types';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { useCategories } from '../../categories/queries.js';
import { formatCurrency } from '../../../lib/currency.js';
import { t } from '../../../lib/i18n.js';
import type { CategoryAggregate } from '../lib/aggregation.js';

// Static map so Tailwind JIT can see every class at build time. Adding a
// new WalletColor without updating this map will fail typecheck.
const COLOR_DOT_CLASS: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-block-navy',
};

interface TopCategoriesCardProps {
  currency: Currency;
  items: CategoryAggregate[];
}

const PREDEFINED_BY_ID: ReadonlyMap<
  string,
  { name: string; color: WalletColor }
> = new Map(
  PREDEFINED_CATEGORIES.map((c) => [
    c.categoryId as string,
    { name: c.name, color: c.color },
  ]),
);

export const TopCategoriesCard = ({
  currency,
  items,
}: TopCategoriesCardProps) => {
  const { data: categoriesData } = useCategories();
  const customById: ReadonlyMap<string, { name: string; color: WalletColor }> =
    new Map(
      (categoriesData?.custom ?? []).map((c) => [
        c.categoryId,
        { name: c.name, color: c.color },
      ]),
    );

  const resolve = (
    categoryId: string,
  ): { name: string; color: WalletColor } => {
    const custom = customById.get(categoryId);
    if (custom !== undefined) return custom;
    const predef = PREDEFINED_BY_ID.get(categoryId);
    if (predef !== undefined) return predef;
    return { name: categoryId.slice(0, 8), color: 'navy' };
  };

  return (
    <ColorBlock tone="cream">
      <Eyebrow>{t.dashboard.topExpenses}</Eyebrow>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/70">
          {t.dashboard.noExpensesYet}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((it) => {
            const meta = resolve(it.categoryId);
            return (
              <li
                key={it.categoryId}
                className="flex items-center gap-3"
              >
                <span
                  className={`inline-block size-3 rounded-full ${COLOR_DOT_CLASS[meta.color]}`}
                  aria-hidden
                />
                <span className="flex-1 truncate text-[15px]">
                  {meta.name}
                </span>
                <span className="font-mono text-xs text-foreground/60">
                  {Math.round(it.share * 100)}%
                </span>
                <span className="text-[15px] font-semibold">
                  {formatCurrency(it.amount, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ColorBlock>
  );
};
