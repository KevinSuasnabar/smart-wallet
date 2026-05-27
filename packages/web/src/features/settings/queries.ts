import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api/client.js';

type LinkStatus = { linked: false } | { linked: true; linkedAt: string };

export const TELEGRAM_LINK_STATUS_KEY = ['telegram', 'link-status'] as const;

export const useGetTelegramLinkStatus = () =>
  useQuery({
    queryKey: TELEGRAM_LINK_STATUS_KEY,
    queryFn: (): Promise<LinkStatus> => apiClient.get<LinkStatus>('/telegram/link-status'),
  });

export const useGenerateTelegramToken = () =>
  useMutation({
    mutationFn: (): Promise<{ token: string }> =>
      apiClient.post<{ token: string }>('/telegram/link-token', {}),
  });
