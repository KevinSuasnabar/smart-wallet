import { apiClient } from '../../lib/api/client.js';
import type {
  AddTransactionDTO,
  UpdateTransactionDTO,
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

  byId: (
    walletId: string,
    transactionId: string,
  ): Promise<TransactionResponseDTO> =>
    apiClient.get<TransactionResponseDTO>(
      `/wallets/${walletId}/transactions/${transactionId}`,
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

  update: (
    walletId: string,
    transactionId: string,
    dto: UpdateTransactionDTO,
    idempotencyKey: string,
  ): Promise<TransactionResponseDTO> =>
    apiClient.patch<TransactionResponseDTO>(
      `/wallets/${walletId}/transactions/${transactionId}`,
      dto,
      { 'Idempotency-Key': idempotencyKey },
    ),

  remove: (walletId: string, transactionId: string): Promise<void> =>
    apiClient.del(`/wallets/${walletId}/transactions/${transactionId}`),
};
