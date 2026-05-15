import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { EmptyState } from '../../../components/common/EmptyState.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { useWalletTransactions } from '../queries.js';
import { useCategories } from '../../categories/queries.js';
import { useWallet } from '../../wallets/queries.js';
import { TransactionListItem } from '../components/TransactionListItem.js';
import { TransactionsListSkeleton } from '../components/TransactionsListSkeleton.js';
import {
  TransactionFilters,
  type TransactionFiltersState,
} from '../components/TransactionFilters.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const TransactionListPage = () => {
  const { walletId = '' } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TransactionFiltersState>({});

  const { data: wallet } = useWallet(walletId);
  const { data: categoriesData } = useCategories();
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWalletTransactions(walletId, filters);

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  const categoryName = (categoryId: string): string | undefined => {
    if (!categoriesData) return undefined;
    const all = [...categoriesData.predefined, ...categoriesData.custom];
    return all.find((c) => c.categoryId === categoryId)?.name;
  };

  const handleBack = () => { void navigate(routes.walletDetail(walletId)); };

  const hasActiveFilters =
    filters.from !== undefined || filters.to !== undefined || filters.type !== undefined;

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="-ml-2 gap-1"
        >
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
        <Link to={routes.walletTransactionsNew(walletId)}>
          <Button size="sm" className="gap-1">
            <Plus className="size-4" />
            {t.transactions.addTitle}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        {wallet && <Eyebrow>{wallet.name}</Eyebrow>}
        <h1 className="text-2xl font-bold tracking-display">
          {t.transactions.listTitle}
        </h1>
      </div>

      <TransactionFilters value={filters} onChange={setFilters} />

      {isLoading && <TransactionsListSkeleton rows={8} />}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && allItems.length === 0 && (
        <EmptyState
          eyebrow="Movimientos"
          message={
            hasActiveFilters
              ? 'No hay transacciones con los filtros aplicados.'
              : t.transactions.emptyState
          }
        />
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <div className="flex flex-col">
          {allItems.map((tx) => (
            <TransactionListItem
              key={tx.transactionId}
              transaction={tx}
              {...(categoryName(tx.categoryId) !== undefined
                ? { categoryName: categoryName(tx.categoryId) as string }
                : {})}
            />
          ))}
          {hasNextPage === true && (
            <Button
              variant="outline"
              onClick={() => { void fetchNextPage(); }}
              disabled={isFetchingNextPage}
              className="mt-4 w-full"
            >
              {isFetchingNextPage ? t.app.loading : t.transactions.loadMore}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
