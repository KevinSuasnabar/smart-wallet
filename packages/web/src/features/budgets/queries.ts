import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBudgetDTO,
  UpdateBudgetDTO,
  BudgetResponseDTO,
} from '@smart-wallet/shared-types';
import { budgetsApi } from './budgetsApi.js';

export const budgetKeys = {
  all: ['budgets'] as const,
};

export const useListBudgets = () =>
  useQuery({
    queryKey: budgetKeys.all,
    queryFn: () => budgetsApi.list(),
  });

export const useCreateBudget = () => {
  const qc = useQueryClient();
  return useMutation<BudgetResponseDTO, Error, CreateBudgetDTO>({
    mutationFn: (dto) => budgetsApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};

export const useUpdateBudget = (budgetId: string) => {
  const qc = useQueryClient();
  return useMutation<BudgetResponseDTO, Error, UpdateBudgetDTO>({
    mutationFn: (dto) => budgetsApi.update(budgetId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};

export const useDeleteBudget = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (budgetId) => budgetsApi.remove(budgetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
};
