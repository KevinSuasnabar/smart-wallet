import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddTransactionDTO,
  UpdateTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
} from '@smart-wallet/shared-types';
import { transactionsApi } from './transactionsApi.js';
import type { TransactionFilters } from './transactionsApi.js';
import { walletKeys } from '../wallets/queries.js';
import { dashboardKeys } from '../dashboard/queries.js';

export const transactionKeys = {
  all: ['transactions'] as const,
  byWallet: (walletId: string) => ['transactions', 'wallet', walletId] as const,
  byWalletFiltered: (walletId: string, filters?: TransactionFilters) =>
    ['transactions', 'wallet', walletId, 'filtered', filters] as const,
  detail: (walletId: string, transactionId: string) =>
    ['transactions', 'detail', walletId, transactionId] as const,
};

export const useWalletTransactions = (walletId: string, filters?: TransactionFilters) =>
  useInfiniteQuery<
    ListTransactionsResponseDTO,
    Error,
    { pages: ListTransactionsResponseDTO[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: transactionKeys.byWalletFiltered(walletId, filters),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      transactionsApi.byWallet(walletId, {
        ...(filters ?? {}),
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: walletId !== '',
  });

export const useAddTransaction = (walletId: string) => {
  const qc = useQueryClient();
  return useMutation<
    TransactionResponseDTO,
    Error,
    { dto: AddTransactionDTO; idempotencyKey: string }
  >({
    mutationFn: ({ dto, idempotencyKey }) => transactionsApi.add(walletId, dto, idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.byWallet(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.detail(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};

/**
 * Loads a single transaction. Used by EditTransactionPage to pre-populate
 * the form from a deep-linkable URL.
 */
export const useTransaction = (walletId: string, transactionId: string) =>
  useQuery({
    queryKey: transactionKeys.detail(walletId, transactionId),
    queryFn: () => transactionsApi.byId(walletId, transactionId),
    enabled: walletId !== '' && transactionId !== '',
    staleTime: 30_000,
  });

/**
 * Updates a transaction. Invalidates all transaction caches and all wallet
 * caches because the mutation touches `wallet.balance` (derived from the
 * transaction's signed delta).
 */
export const useUpdateTransaction = (walletId: string) => {
  const qc = useQueryClient();
  return useMutation<
    TransactionResponseDTO,
    Error,
    {
      transactionId: string;
      dto: UpdateTransactionDTO;
      idempotencyKey: string;
    }
  >({
    mutationFn: ({ transactionId, dto, idempotencyKey }) =>
      transactionsApi.update(walletId, transactionId, dto, idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.all });
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};

/**
 * Hard-deletes a transaction. Same invalidation scope as useUpdateTransaction
 * because the wallet balance reverts by the original signed delta.
 */
export const useDeleteTransaction = (walletId: string) => {
  const qc = useQueryClient();
  return useMutation<void, Error, { transactionId: string }>({
    mutationFn: ({ transactionId }) => transactionsApi.remove(walletId, transactionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.all });
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};
