import { Link } from 'react-router-dom';
import { ErrorState } from '../../../components/common/ErrorState.js';
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
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t.transactions.emptyState}</p>
      </div>
    );
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
      <Link
        to={routes.walletTransactions(walletId)}
        className="text-center text-sm text-primary underline underline-offset-2 mt-3 py-2"
      >
        Ver todos
      </Link>
    </div>
  );
};
