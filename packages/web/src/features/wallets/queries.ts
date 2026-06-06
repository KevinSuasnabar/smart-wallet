import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWalletDTO,
  UpdateWalletDTO,
  WalletResponseDTO,
  ListWalletsQueryDTO,
} from '@smart-wallet/shared-types';
import { walletsApi } from './walletsApi.js';
import { dashboardKeys } from '../dashboard/queries.js';

export const walletKeys = {
  all: ['wallets'] as const,
  list: (query?: ListWalletsQueryDTO) => ['wallets', 'list', query] as const,
  detail: (walletId: string) => ['wallets', walletId] as const,
};

export const useWallets = (query?: ListWalletsQueryDTO) =>
  useQuery({
    queryKey: walletKeys.list(query),
    queryFn: () => walletsApi.list(query),
  });

export const useWallet = (walletId: string | undefined) =>
  useQuery({
    queryKey:
      walletId !== undefined && walletId !== '' ? walletKeys.detail(walletId) : walletKeys.all,
    queryFn: (): Promise<WalletResponseDTO> => {
      if (walletId === undefined || walletId === '') {
        throw new Error('walletId requerido');
      }
      return walletsApi.get(walletId);
    },
    enabled: walletId !== undefined && walletId !== '',
  });

export const useCreateWallet = () => {
  const qc = useQueryClient();
  return useMutation<WalletResponseDTO, Error, CreateWalletDTO>({
    mutationFn: (dto: CreateWalletDTO) => walletsApi.create(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};

/**
 * Edit a wallet. Invalidates the wallet caches on success.
 */
export const useUpdateWallet = () => {
  const qc = useQueryClient();
  return useMutation<WalletResponseDTO, Error, { walletId: string; dto: UpdateWalletDTO }>({
    mutationFn: ({ walletId, dto }) => walletsApi.update(walletId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
};

/**
 * Hard-delete a wallet + cascade delete all its transactions. Invalidates
 * BOTH wallet AND transaction caches because the cascade clears tx rows
 * the frontend may have shown for this wallet.
 */
export const useDeleteWallet = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { walletId: string }>({
    mutationFn: ({ walletId }) => walletsApi.remove(walletId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
