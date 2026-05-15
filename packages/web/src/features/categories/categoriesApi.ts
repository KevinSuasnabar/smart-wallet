import { apiClient } from '../../lib/api/client.js';
import type {
  CreateCustomCategoryDTO,
  UpdateCategoryDTO,
  CategoryResponseDTO,
  ListCategoriesResponseDTO,
} from '@smart-wallet/shared-types';

export const categoriesApi = {
  list: (): Promise<ListCategoriesResponseDTO> =>
    apiClient.get<ListCategoriesResponseDTO>('/categories'),

  create: (dto: CreateCustomCategoryDTO): Promise<CategoryResponseDTO> =>
    apiClient.post<CategoryResponseDTO>('/categories', dto),

  update: (
    categoryId: string,
    dto: UpdateCategoryDTO,
  ): Promise<CategoryResponseDTO> =>
    apiClient.patch<CategoryResponseDTO>(`/categories/${categoryId}`, dto),

  delete: (categoryId: string): Promise<void> =>
    apiClient.del(`/categories/${categoryId}`),
};
