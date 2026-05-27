import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import {
  PREDEFINED_CATEGORIES,
  type BudgetListItemDTO,
  type WalletColor,
} from '@smart-wallet/shared-types';
import { Card } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { cn } from '../../../lib/utils.js';
import { formatCurrency } from '../../../lib/currency.js';
import { useCategories } from '../../categories/queries.js';
import { BudgetProgressBar } from './BudgetProgressBar.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

const COLOR_DOT_CLASS: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-foreground',
};

const PREDEFINED_BY_ID: ReadonlyMap<string, { name: string; color: WalletColor }> = new Map(
  PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, { name: c.name, color: c.color }]),
);

interface BudgetCardProps {
  item: BudgetListItemDTO;
  onDelete: (item: BudgetListItemDTO) => void;
}

export const BudgetCard = ({ item, onDelete }: BudgetCardProps) => {
  const { data: categoriesData } = useCategories();

  let label: string;
  let dotColor: WalletColor = 'navy';

  if (item.type === 'per_category' && item.categoryId !== undefined) {
    const custom = categoriesData?.custom.find((c) => c.categoryId === item.categoryId);
    const predef = PREDEFINED_BY_ID.get(item.categoryId);
    label = custom?.name ?? predef?.name ?? item.categoryId.slice(0, 8);
    dotColor = custom?.color ?? predef?.color ?? 'navy';
  } else {
    label = t.budgets.typeGlobal;
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-1 inline-block size-3 shrink-0 rounded-full',
            COLOR_DOT_CLASS[dotColor],
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">{label}</span>
            {item.rollover && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-caption text-foreground/60">
                {t.budgets.rolloverBadge}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] uppercase tracking-caption text-foreground/55">
            {item.currency}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Editar">
            <Link to={routes.budgetEdit(item.budgetId)}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => onDelete(item)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <BudgetProgressBar spent={item.spent} effectiveLimit={item.effectiveLimit} />

      <div className="flex justify-between text-sm text-foreground/70">
        <span>
          {t.budgets.spentLabel}:{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(item.spent, item.currency)}
          </span>
        </span>
        <span>
          {t.budgets.effectiveLimitLabel}:{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(item.effectiveLimit, item.currency)}
          </span>
        </span>
      </div>
    </Card>
  );
};
