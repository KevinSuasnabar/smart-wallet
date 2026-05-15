import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionResponseDTO } from '@smart-wallet/shared-types';
import { formatSignedAmount } from '../../../lib/currency.js';
import { cn } from '../../../lib/utils.js';

interface TransactionListItemProps {
  transaction: TransactionResponseDTO;
  categoryName?: string;
}

/**
 * An editorial transaction row — hairline divider, no card. Income carries
 * the semantic-success green; expense stays neutral ink. The date is set in
 * mono as a caption, flagging it as metadata rather than body copy.
 */
export const TransactionListItem = ({
  transaction,
  categoryName,
}: TransactionListItemProps) => {
  const { type, amount, currency, description, occurredAt, categoryId } =
    transaction;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
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
          'whitespace-nowrap font-bold tabular-nums tracking-tightest',
          type === 'income' ? 'text-success' : 'text-foreground',
        )}
      >
        {formatSignedAmount(amount, currency, type)}
      </p>
    </div>
  );
};
