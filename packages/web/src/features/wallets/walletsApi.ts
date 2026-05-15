import { apiClient } from '../../lib/api/client.js';
import type {
  CreateWalletDTO,
  UpdateWalletDTO,
  WalletResponseDTO,
  ListWalletsResponseDTO,
  ListWalletsQueryDTO,
} from '@smart-wallet/shared-types';

export const walletsApi = {
  list: (query?: ListWalletsQueryDTO): Promise<ListWalletsResponseDTO> =>
    apiClient.get<ListWalletsResponseDTO>('/wallets', query),

  get: (walletId: string): Promise<WalletResponseDTO> =>
    apiClient.get<WalletResponseDTO>(`/wallets/${walletId}`),

  create: (dto: CreateWalletDTO): Promise<WalletResponseDTO> =>
    apiClient.post<WalletResponseDTO>('/wallets', dto),

  update: (walletId: string, dto: UpdateWalletDTO): Promise<WalletResponseDTO> =>
    apiClient.patch<WalletResponseDTO>(`/wallets/${walletId}`, dto),

  remove: (walletId: string): Promise<void> =>
    apiClient.del(`/wallets/${walletId}`),
};
