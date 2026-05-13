import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomCategoryDTO,
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

export const useDeleteCustomCategory = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (categoryId) => categoriesApi.delete(categoryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};
