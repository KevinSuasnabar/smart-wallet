import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateRecurringDTO,
  UpdateRecurringDTO,
  RecurringResponseDTO,
  MaterializeRecurringResponseDTO,
} from '@smart-wallet/shared-types';
import { recurringApi } from './recurringApi.js';
import { walletKeys } from '../wallets/queries.js';

export const recurringKeys = {
  all: ['recurring'] as const,
  detail: (recurringId: string) =>
    ['recurring', 'detail', recurringId] as const,
};

export const useRecurringList = () =>
  useQuery({
    queryKey: recurringKeys.all,
    queryFn: () => recurringApi.list(),
  });

export const useRecurring = (recurringId: string) =>
  useQuery({
    queryKey: recurringKeys.detail(recurringId),
    queryFn: () => recurringApi.byId(recurringId),
    enabled: recurringId !== '',
  });

export const useCreateRecurring = () => {
  const qc = useQueryClient();
  return useMutation<RecurringResponseDTO, Error, CreateRecurringDTO>({
    mutationFn: (dto) => recurringApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recurringKeys.all });
    },
  });
};

export const useUpdateRecurring = (recurringId: string) => {
  const qc = useQueryClient();
  return useMutation<RecurringResponseDTO, Error, UpdateRecurringDTO>({
    mutationFn: (dto) => recurringApi.update(recurringId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recurringKeys.all });
      void qc.invalidateQueries({
        queryKey: recurringKeys.detail(recurringId),
      });
    },
  });
};

export const useDeleteRecurring = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (recurringId) => recurringApi.remove(recurringId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recurringKeys.all });
    },
  });
};

/**
 * Fire-and-forget materialization triggered by the dashboard on mount. The
 * mutation invalidates wallets + transactions caches when at least one
 * recurring was materialized, so the dashboard's monthly aggregation
 * picks up the new transactions.
 */
export const useMaterializeRecurrings = () => {
  const qc = useQueryClient();
  return useMutation<MaterializeRecurringResponseDTO, Error, void>({
    mutationFn: () => recurringApi.materialize(),
    onSuccess: (res) => {
      if (res.materializedCount > 0) {
        void qc.invalidateQueries({ queryKey: walletKeys.all });
        void qc.invalidateQueries({ queryKey: ['transactions'] });
        void qc.invalidateQueries({ queryKey: recurringKeys.all });
      }
    },
  });
};
