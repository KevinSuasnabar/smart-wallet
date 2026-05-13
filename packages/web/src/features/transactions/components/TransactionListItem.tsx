import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionResponseDTO } from '@smart-wallet/shared-types';
import { formatSignedAmount } from '../../../lib/currency.js';
import { cn } from '../../../lib/utils.js';

interface TransactionListItemProps {
  transaction: TransactionResponseDTO;
  categoryName?: string;
}

export const TransactionListItem = ({
  transaction,
  categoryName,
}: TransactionListItemProps) => {
  const { type, amount, currency, description, occurredAt, categoryId } =
    transaction;
  const amountClass =
    type === 'income' ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0">
      <div className="flex flex-col min-w-0 flex-1">
        <p className="font-medium truncate">{categoryName ?? categoryId}</p>
        {description !== undefined && description !== '' && (
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {format(new Date(occurredAt), "d MMM yyyy", { locale: es })}
        </p>
      </div>
      <p className={cn('font-semibold whitespace-nowrap', amountClass)}>
        {formatSignedAmount(amount, currency, type)}
      </p>
    </div>
  );
};
