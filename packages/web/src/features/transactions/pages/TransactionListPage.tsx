import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { EmptyState } from '../../../components/common/EmptyState.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { useWalletTransactions, useDeleteTransaction } from '../queries.js';
import { useCategories } from '../../categories/queries.js';
import { useWallet } from '../../wallets/queries.js';
import { TransactionListItem } from '../components/TransactionListItem.js';
import { TransactionsListSkeleton } from '../components/TransactionsListSkeleton.js';
import { DeleteTransactionDialog } from '../components/DeleteTransactionDialog.js';
import {
  TransactionFilters,
  type TransactionFiltersState,
} from '../components/TransactionFilters.js';
import { routes } from '../../../app/routes.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';

export const TransactionListPage = () => {
  const { walletId = '' } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TransactionFiltersState>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: wallet } = useWallet(walletId);
  const { data: categoriesData } = useCategories();
  const deleteMutation = useDeleteTransaction(walletId);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useWalletTransactions(walletId, filters);

  const confirmDelete = () => {
    if (pendingDeleteId === null) return;
    deleteMutation.mutate(
      { transactionId: pendingDeleteId },
      {
        onSuccess: () => {
          toast.success(t.transactions.deleteSuccess);
          setPendingDeleteId(null);
        },
        onError: (err) => {
          toast.error(userMessageFor(err));
          setPendingDeleteId(null);
        },
      },
    );
  };

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  const categoryName = (categoryId: string): string | undefined => {
    if (!categoriesData) return undefined;
    const all = [...categoriesData.predefined, ...categoriesData.custom];
    return all.find((c) => c.categoryId === categoryId)?.name;
  };

  const handleBack = () => {
    void navigate(routes.walletDetail(walletId));
  };

  const hasActiveFilters =
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.type !== undefined ||
    filters.categoryId !== undefined;

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2 gap-1">
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

      <div className="flex flex-col gap-2">
        {wallet && <Eyebrow>{wallet.name}</Eyebrow>}
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.transactions.listTitle}
        </h1>
        {!isLoading && !isError && allItems.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {allItems.length}
            {hasNextPage ? '+' : ''} {allItems.length === 1 ? 'movimiento' : 'movimientos'}
          </p>
        )}
      </div>

      <TransactionFilters value={filters} onChange={setFilters} />

      {isLoading && (
        <Card className="p-2 md:p-4">
          <TransactionsListSkeleton rows={8} />
        </Card>
      )}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => {
            void refetch();
          }}
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
        <Card className="px-4 pb-4 pt-2 md:px-6">
          {allItems.map((tx) => (
            <TransactionListItem
              key={tx.transactionId}
              transaction={tx}
              onDelete={(id) => setPendingDeleteId(id)}
              {...(categoryName(tx.categoryId) !== undefined
                ? { categoryName: categoryName(tx.categoryId)! }
                : {})}
            />
          ))}
          {isFetchingNextPage && <TransactionsListSkeleton rows={4} />}
          {hasNextPage === true && !isFetchingNextPage && (
            <Button
              variant="outline"
              onClick={() => {
                void fetchNextPage();
              }}
              className="mt-4 w-full"
            >
              {t.transactions.loadMore}
            </Button>
          )}
        </Card>
      )}

      <DeleteTransactionDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
};
