import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import type { TransactionResponseDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { formatSignedAmount } from '../../../lib/currency.js';
import { cn } from '../../../lib/utils.js';
import { routes } from '../../../app/routes.js';

interface TransactionListItemProps {
  transaction: TransactionResponseDTO;
  categoryName?: string;
  /**
   * When provided, an edit pencil and a delete trash button render on the
   * right of the row. The pencil navigates to the edit route; the trash
   * invokes `onDelete(transactionId)` so the parent owns the dialog state.
   */
  onDelete?: (transactionId: string) => void;
}

/**
 * A transaction row carries a left pastel stripe (mint for income, coral
 * for expense) and a display-scale amount — taxonomy by color, magnitude by
 * type-size. The DESIGN.md monochrome chrome stays; the stripe is the only
 * accent the row earns.
 *
 * The body is a `<Link>` to the transaction detail page and carries the current
 * pathname so that page knows where "back" belongs. The action group stays a
 * SIBLING of that link — nesting buttons inside an anchor is invalid HTML and
 * breaks keyboard and screen-reader navigation.
 *
 * When `onDelete` is passed, an action group (pencil + trash) is appended on
 * the right side of the row.
 */
export const TransactionListItem = ({
  transaction,
  categoryName,
  onDelete,
}: TransactionListItemProps) => {
  const {
    transactionId,
    walletId,
    type,
    amount,
    currency,
    description,
    occurredAt,
    categoryId,
  } = transaction;
  const navigate = useNavigate();
  const location = useLocation();

  const handleEdit = () => {
    void navigate(routes.walletTransactionEdit(walletId, transactionId), {
      state: { from: location.pathname },
    });
  };

  return (
    <div className="flex items-stretch border-b border-border last:border-b-0">
      <span
        aria-hidden
        className={cn(
          'my-3 w-1.5 shrink-0 self-stretch rounded-sm',
          type === 'income' ? 'bg-block-mint' : 'bg-block-coral',
        )}
      />
      <Link
        to={routes.walletTransactionDetail(walletId, transactionId)}
        state={{ from: location.pathname }}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm py-4 pl-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-semibold tracking-tightest">
            {categoryName ?? categoryId}
          </p>
          {description !== undefined && description !== '' && (
            <p className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          )}
          <p className="font-mono text-[10px] uppercase tracking-caption text-muted-foreground">
            {format(new Date(occurredAt), 'd MMM yyyy', { locale: es })}
          </p>
        </div>
        <p
          className={cn(
            'shrink-0 whitespace-nowrap text-xl font-bold tabular-nums tracking-display md:text-2xl',
            type === 'income' ? 'text-success' : 'text-foreground',
          )}
        >
          {formatSignedAmount(amount, currency, type)}
        </p>
      </Link>
      {onDelete && (
        <div className="flex shrink-0 items-center gap-0.5 self-center pl-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleEdit}
            aria-label="Editar movimiento"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(transactionId)}
            aria-label="Eliminar movimiento"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
