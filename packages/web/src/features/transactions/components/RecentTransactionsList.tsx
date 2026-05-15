import { Link } from 'react-router-dom';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { EmptyState } from '../../../components/common/EmptyState.js';
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
}

export const RecentTransactionsList = ({
  walletId,
  limit = 10,
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

  if (isLoading) return <TransactionsListSkeleton rows={5} />;

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
    <div className="flex flex-col">
      {items.map((tx) => (
        <TransactionListItem
          key={tx.transactionId}
          transaction={tx}
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
    </div>
  );
};
