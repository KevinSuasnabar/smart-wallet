import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import {
  PREDEFINED_CATEGORIES,
  type RecurringResponseDTO,
  type WalletColor,
} from '@smart-wallet/shared-types';
import { Card } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { cn } from '../../../lib/utils.js';
import { formatCurrency } from '../../../lib/currency.js';
import { useCategories } from '../../categories/queries.js';
import { useWallets } from '../../wallets/queries.js';
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

const PREDEFINED_BY_ID: ReadonlyMap<
  string,
  { name: string; color: WalletColor }
> = new Map(
  PREDEFINED_CATEGORIES.map((c) => [
    c.categoryId as string,
    { name: c.name, color: c.color },
  ]),
);

const DATE_FORMAT = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
});

interface RecurringListItemProps {
  item: RecurringResponseDTO;
  onDelete: (item: RecurringResponseDTO) => void;
}

export const RecurringListItem = ({
  item,
  onDelete,
}: RecurringListItemProps) => {
  const { data: walletsData } = useWallets();
  const { data: categoriesData } = useCategories();

  const wallet = walletsData?.items.find((w) => w.walletId === item.walletId);
  const customCategory = categoriesData?.custom.find(
    (c) => c.categoryId === item.categoryId,
  );
  const predef = PREDEFINED_BY_ID.get(item.categoryId);
  const categoryName =
    customCategory?.name ?? predef?.name ?? item.categoryId.slice(0, 8);
  const categoryColor: WalletColor =
    customCategory?.color ?? predef?.color ?? 'navy';

  const nextLabel = DATE_FORMAT.format(new Date(item.nextOccurrenceAt));
  const description = item.description ?? t.recurring.descriptionFallback;

  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'inline-block size-3 rounded-full',
          COLOR_DOT_CLASS[categoryColor],
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-base font-semibold">
            {description}
          </span>
        </div>
        <div className="mt-0.5 truncate text-sm text-foreground/70">
          {wallet?.name ?? '—'} · {categoryName}
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-caption text-foreground/55">
          {t.recurring.nextOccurrenceLabel}: {nextLabel}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[15px] font-semibold whitespace-nowrap',
            item.type === 'income' ? 'text-foreground' : 'text-foreground',
          )}
        >
          {item.type === 'income' ? '+' : '−'}
          {formatCurrency(item.amount, item.currency)}
        </span>
        <Button asChild size="icon" variant="ghost" aria-label="Editar">
          <Link to={routes.recurringEdit(item.recurringId)}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Eliminar"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
};
