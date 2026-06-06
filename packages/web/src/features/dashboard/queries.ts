import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from './dashboardApi.js';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  monthly: () => ['dashboard', 'monthly'] as const,
};

export const useMonthlyDashboardQuery = () =>
  useQuery({
    queryKey: dashboardKeys.monthly(),
    queryFn: () => dashboardApi.monthly(),
    staleTime: 30_000,
  });
