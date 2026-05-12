import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zPaginatedResponse } from '../pagination.js';

export const CreateWalletRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Wallet name must not be empty')
    .max(64, 'Wallet name must not exceed 64 characters'),
  currency: zCurrency,
});

export type CreateWalletDTO = z.infer<typeof CreateWalletRequestSchema>;

export const WalletResponseSchema = z.object({
  walletId: z.string(),
  name: z.string(),
  currency: zCurrency,
  /** Balance serialized as signed decimal string, e.g. "12.34" or "-3.50" */
  balance: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WalletResponseDTO = z.infer<typeof WalletResponseSchema>;

export const ListWalletsResponseSchema = zPaginatedResponse(WalletResponseSchema);

export type ListWalletsResponseDTO = z.infer<typeof ListWalletsResponseSchema>;
