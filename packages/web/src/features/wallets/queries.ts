import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWalletDTO,
  WalletResponseDTO,
  ListWalletsQueryDTO,
} from '@smart-wallet/shared-types';
import { walletsApi } from './walletsApi.js';

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
    queryKey: walletId !== undefined && walletId !== ''
      ? walletKeys.detail(walletId)
      : walletKeys.all,
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
    },
  });
};
