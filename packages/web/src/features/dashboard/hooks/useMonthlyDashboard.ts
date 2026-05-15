import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  Currency,
  TransactionResponseDTO,
} from '@smart-wallet/shared-types';
import { useWallets } from '../../wallets/queries.js';
import { transactionKeys } from '../../transactions/queries.js';
import { transactionsApi } from '../../transactions/transactionsApi.js';
import {
  monthBoundaries,
  sumBalancesByCurrency,
  splitIncomeExpense,
  topCategoriesByAmount,
  type CategoryAggregate,
  type CurrencyBalance,
} from '../lib/aggregation.js';
import { sub } from '../../../lib/decimal.js';

export interface MonthlyDashboard {
  totalsByCurrency: CurrencyBalance[];
  monthlyIncome: string;
  monthlyExpenses: string;
  monthlyNet: string;
  topCategories: CategoryAggregate[];
  availableCurrencies: Currency[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
}

const EMPTY_MONTH = {
  monthlyIncome: '0.00',
  monthlyExpenses: '0.00',
  monthlyNet: '0.00',
  topCategories: [] as CategoryAggregate[],
};

export const useMonthlyDashboard = (
  displayCurrency: Currency | null,
): MonthlyDashboard => {
  const wallets = useWallets();
  // Snapshot the month range once per hook lifetime; otherwise the
  // queryKey would change on every render and force constant refetches.
  const range = useMemo(() => monthBoundaries(new Date()), []);

  const items = wallets.data?.items ?? [];
  const txQueries = useQueries({
    queries: items.map((w) => ({
      queryKey: [
        ...transactionKeys.byWalletFiltered(w.walletId, range),
        'drain',
      ],
      queryFn: async (): Promise<TransactionResponseDTO[]> => {
        const out: TransactionResponseDTO[] = [];
        let cursor: string | undefined = undefined;
        // Drain loop — page through until the server stops sending a cursor.
        // This is required so the aggregation includes ALL the month's tx,
        // not just the first page (the listing page uses an infinite query
        // with the same filters, but the dashboard needs everything).
        do {
          const page = await transactionsApi.byWallet(w.walletId, {
            ...range,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          out.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return out;
      },
      enabled: w.walletId !== '',
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const totalsByCurrency = sumBalancesByCurrency(items);
    const availableCurrencies = totalsByCurrency.map((b) => b.currency);

    const isLoading =
      wallets.isLoading || txQueries.some((q) => q.isLoading);
    const isError =
      wallets.isError || txQueries.some((q) => q.isError);

    const refetch = async () => {
      await wallets.refetch();
      await Promise.all(txQueries.map((q) => q.refetch()));
    };

    if (isLoading || isError || displayCurrency === null) {
      return {
        totalsByCurrency,
        ...EMPTY_MONTH,
        availableCurrencies,
        isLoading,
        isError,
        refetch,
      };
    }

    const txOfCurrency: TransactionResponseDTO[] = [];
    items.forEach((w, i) => {
      if (w.currency !== displayCurrency) return;
      const data = txQueries[i]?.data;
      if (data !== undefined) txOfCurrency.push(...data);
    });

    const stats = splitIncomeExpense(txOfCurrency);
    const monthlyNet = sub(stats.income, stats.expenses);
    const topCats = topCategoriesByAmount(
      txOfCurrency.filter((t) => t.type === 'expense'),
      3,
    );

    return {
      totalsByCurrency,
      monthlyIncome: stats.income,
      monthlyExpenses: stats.expenses,
      monthlyNet,
      topCategories: topCats,
      availableCurrencies,
      isLoading: false,
      isError: false,
      refetch,
    };
    // The set of useQueries entries is fully derived from `items`, so we
    // depend on the union of their dataUpdatedAt timestamps to detect any
    // page settling without subscribing to each one individually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallets.data,
    wallets.isLoading,
    wallets.isError,
    displayCurrency,
    txQueries.map((q) => `${q.status}:${q.dataUpdatedAt}`).join('|'),
  ]);
};
