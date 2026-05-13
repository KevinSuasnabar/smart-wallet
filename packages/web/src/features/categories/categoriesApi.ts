import { apiClient } from '../../lib/api/client.js';
import type {
  CreateCustomCategoryDTO,
  CategoryResponseDTO,
  ListCategoriesResponseDTO,
} from '@smart-wallet/shared-types';

export const categoriesApi = {
  list: (): Promise<ListCategoriesResponseDTO> =>
    apiClient.get<ListCategoriesResponseDTO>('/categories'),

  create: (dto: CreateCustomCategoryDTO): Promise<CategoryResponseDTO> =>
    apiClient.post<CategoryResponseDTO>('/categories', dto),

  delete: (categoryId: string): Promise<void> =>
    apiClient.del(`/categories/${categoryId}`),
};
