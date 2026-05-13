import { apiClient } from '../../lib/api/client.js';
import type {
  AddTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
  ListTransactionsByWalletQueryDTO,
} from '@smart-wallet/shared-types';

export type TransactionFilters = Partial<ListTransactionsByWalletQueryDTO>;

export const transactionsApi = {
  byWallet: (
    walletId: string,
    query?: TransactionFilters,
  ): Promise<ListTransactionsResponseDTO> =>
    apiClient.get<ListTransactionsResponseDTO>(
      `/wallets/${walletId}/transactions`,
      query as Record<string, string | number | undefined> | undefined,
    ),

  add: (
    walletId: string,
    dto: AddTransactionDTO,
    idempotencyKey: string,
  ): Promise<TransactionResponseDTO> =>
    apiClient.post<TransactionResponseDTO>(
      `/wallets/${walletId}/transactions`,
      dto,
      { 'Idempotency-Key': idempotencyKey },
    ),
};
