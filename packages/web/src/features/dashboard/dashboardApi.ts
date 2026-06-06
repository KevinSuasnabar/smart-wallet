import type { MonthlyDashboardResponseDTO } from '@smart-wallet/shared-types';
import { apiClient } from '../../lib/api/client.js';

export const dashboardApi = {
  monthly: (): Promise<MonthlyDashboardResponseDTO> =>
    apiClient.get<MonthlyDashboardResponseDTO>('/dashboard/monthly'),
};
