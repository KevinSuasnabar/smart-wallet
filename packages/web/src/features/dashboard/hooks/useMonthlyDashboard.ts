import { useMemo } from 'react';
import type { Currency } from '@smart-wallet/shared-types';
import type { CategoryAggregate, CurrencyBalance } from '../lib/aggregation.js';
import { useMonthlyDashboardQuery } from '../queries.js';

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

export const useMonthlyDashboard = (displayCurrency: Currency | null): MonthlyDashboard => {
  const dashboard = useMonthlyDashboardQuery();

  return useMemo(() => {
    const totalsByCurrency = dashboard.data?.totalsByCurrency ?? [];
    const availableCurrencies = totalsByCurrency.map((b) => b.currency);

    const refetch = async () => {
      await dashboard.refetch();
    };

    if (dashboard.isLoading || dashboard.isError || displayCurrency === null) {
      return {
        totalsByCurrency,
        ...EMPTY_MONTH,
        availableCurrencies,
        isLoading: dashboard.isLoading,
        isError: dashboard.isError,
        refetch,
      };
    }

    const summary = dashboard.data?.summariesByCurrency.find(
      (item) => item.currency === displayCurrency,
    );

    return {
      totalsByCurrency,
      monthlyIncome: summary?.monthlyIncome ?? EMPTY_MONTH.monthlyIncome,
      monthlyExpenses: summary?.monthlyExpenses ?? EMPTY_MONTH.monthlyExpenses,
      monthlyNet: summary?.monthlyNet ?? EMPTY_MONTH.monthlyNet,
      topCategories: summary?.topCategories ?? EMPTY_MONTH.topCategories,
      availableCurrencies,
      isLoading: false,
      isError: false,
      refetch,
    };
  }, [
    dashboard.data,
    dashboard.isLoading,
    dashboard.isError,
    dashboard.dataUpdatedAt,
    displayCurrency,
  ]);
};
