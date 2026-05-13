import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AddTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
} from '@smart-wallet/shared-types';
import { transactionsApi } from './transactionsApi.js';
import type { TransactionFilters } from './transactionsApi.js';
import { walletKeys } from '../wallets/queries.js';

export const transactionKeys = {
  all: ['transactions'] as const,
  byWallet: (walletId: string) => ['transactions', 'wallet', walletId] as const,
  byWalletFiltered: (
    walletId: string,
    filters?: TransactionFilters,
  ) => ['transactions', 'wallet', walletId, 'filtered', filters] as const,
};

export const useWalletTransactions = (
  walletId: string,
  filters?: TransactionFilters,
) =>
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
    mutationFn: ({ dto, idempotencyKey }) =>
      transactionsApi.add(walletId, dto, idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.byWallet(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.detail(walletId) });
      void qc.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
};
