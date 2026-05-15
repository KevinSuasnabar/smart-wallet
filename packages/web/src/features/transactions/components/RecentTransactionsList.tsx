import { Link } from 'react-router-dom';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { EmptyState } from '../../../components/common/EmptyState.js';
import { Card } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { useWalletTransactions } from '../queries.js';
import { TransactionListItem } from './TransactionListItem.js';
import { TransactionsListSkeleton } from './TransactionsListSkeleton.js';
import { useCategories } from '../../categories/queries.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

interface RecentTransactionsListProps {
  walletId: string;
  limit?: number;
  /**
   * When provided, each row renders an action group (edit + delete). The
   * parent owns the dialog state and the mutation.
   */
  onDelete?: (transactionId: string) => void;
}

export const RecentTransactionsList = ({
  walletId,
  limit = 10,
  onDelete,
}: RecentTransactionsListProps) => {
  const { data, isLoading, isError, refetch } = useWalletTransactions(walletId, {
    limit,
  });
  const { data: categories } = useCategories();

  const items = data?.pages[0]?.items ?? [];

  const categoryName = (categoryId: string): string | undefined => {
    if (!categories) return undefined;
    const all = [...categories.predefined, ...categories.custom];
    return all.find((c) => c.categoryId === categoryId)?.name;
  };

  if (isLoading) {
    return (
      <Card className="p-2 md:p-4">
        <TransactionsListSkeleton rows={5} />
      </Card>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={t.errors.generic}
        onRetry={() => { void refetch(); }}
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState eyebrow="Actividad" message={t.transactions.emptyState} />;
  }

  return (
    <Card className="px-4 pb-4 pt-2 md:px-6">
      {items.map((tx) => (
        <TransactionListItem
          key={tx.transactionId}
          transaction={tx}
          {...(onDelete !== undefined ? { onDelete } : {})}
          {...(categoryName(tx.categoryId) !== undefined
            ? { categoryName: categoryName(tx.categoryId) as string }
            : {})}
        />
      ))}
      <Button asChild variant="outline" size="sm" className="mt-4 w-full">
        <Link to={routes.walletTransactions(walletId)}>
          Ver todos los movimientos
        </Link>
      </Button>
    </Card>
  );
};
