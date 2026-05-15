import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomCategoryDTO,
  UpdateCategoryDTO,
  CategoryResponseDTO,
} from '@smart-wallet/shared-types';
import { categoriesApi } from './categoriesApi.js';

export const categoryKeys = {
  all: ['categories'] as const,
};

export const useCategories = () =>
  useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => categoriesApi.list(),
  });

export const useCreateCustomCategory = () => {
  const qc = useQueryClient();
  return useMutation<CategoryResponseDTO, Error, CreateCustomCategoryDTO>({
    mutationFn: (dto) => categoriesApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

/**
 * Edit a category. The endpoint dispatches by id kind on the server:
 *  - custom UUID → in-place update.
 *  - predefined  → fork: creates a new custom + hides the predefined for this
 *    user + migrates that user's transactions to the new custom id.
 *
 * Invalidates BOTH `categories` and `transactions` caches because a fork
 * rewrites the categoryId on the affected transactions.
 */
export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation<
    CategoryResponseDTO,
    Error,
    { categoryId: string; dto: UpdateCategoryDTO }
  >({
    mutationFn: ({ categoryId, dto }) => categoriesApi.update(categoryId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

/**
 * Delete (custom) or hide (predefined). Same endpoint either way. Invalidates
 * categories AND transactions (the latter because a hide on a category with
 * transactions is blocked server-side, but a successful delete on a custom
 * could still race with a transaction list refetch).
 */
export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (categoryId) => categoriesApi.delete(categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

// Legacy alias for callers that still import the old name.
export const useDeleteCustomCategory = useDeleteCategory;
