import { apiClient } from '../../lib/api/client.js';
import type {
  CreateBudgetDTO,
  UpdateBudgetDTO,
  BudgetResponseDTO,
  ListBudgetsResponseDTO,
} from '@smart-wallet/shared-types';

export const budgetsApi = {
  list: (): Promise<ListBudgetsResponseDTO> => apiClient.get<ListBudgetsResponseDTO>('/budgets'),

  create: (dto: CreateBudgetDTO): Promise<BudgetResponseDTO> =>
    apiClient.post<BudgetResponseDTO>('/budgets', dto),

  update: (budgetId: string, dto: UpdateBudgetDTO): Promise<BudgetResponseDTO> =>
    apiClient.patch<BudgetResponseDTO>(`/budgets/${budgetId}`, dto),

  remove: (budgetId: string): Promise<void> => apiClient.del(`/budgets/${budgetId}`),
};
