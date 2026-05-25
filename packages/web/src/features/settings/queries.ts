import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api/client.js';

export const useGenerateTelegramToken = () =>
  useMutation({
    mutationFn: (): Promise<{ token: string }> =>
      apiClient.post<{ token: string }>('/telegram/link-token', {}),
  });
