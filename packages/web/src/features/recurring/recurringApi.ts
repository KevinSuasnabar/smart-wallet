import { apiClient } from '../../lib/api/client.js';
import type {
  CreateRecurringDTO,
  UpdateRecurringDTO,
  RecurringResponseDTO,
  ListRecurringResponseDTO,
  MaterializeRecurringResponseDTO,
} from '@smart-wallet/shared-types';

export const recurringApi = {
  list: (): Promise<ListRecurringResponseDTO> =>
    apiClient.get<ListRecurringResponseDTO>('/recurring'),

  byId: (recurringId: string): Promise<RecurringResponseDTO> =>
    apiClient.get<RecurringResponseDTO>(`/recurring/${recurringId}`),

  create: (dto: CreateRecurringDTO): Promise<RecurringResponseDTO> =>
    apiClient.post<RecurringResponseDTO>('/recurring', dto),

  update: (
    recurringId: string,
    dto: UpdateRecurringDTO,
  ): Promise<RecurringResponseDTO> =>
    apiClient.patch<RecurringResponseDTO>(`/recurring/${recurringId}`, dto),

  remove: (recurringId: string): Promise<void> =>
    apiClient.del(`/recurring/${recurringId}`),

  materialize: (): Promise<MaterializeRecurringResponseDTO> =>
    apiClient.post<MaterializeRecurringResponseDTO>(
      '/recurring/materialize',
      {},
    ),
};
