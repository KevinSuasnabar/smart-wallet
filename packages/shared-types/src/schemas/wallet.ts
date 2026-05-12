import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zPaginatedResponse, zLimit, zCursor } from '../pagination.js';
import { zUuid } from './common.js';

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

/**
 * Query string schema for GET /wallets — limit and cursor are both optional.
 * limit is coerced from string (query param) to number.
 * REQ-WAL-08
 */
export const ListWalletsQuerySchema = z.object({
  limit: zLimit,
  cursor: zCursor,
});

export type ListWalletsQueryDTO = z.infer<typeof ListWalletsQuerySchema>;

/**
 * Path parameter schema for routes that reference a specific wallet.
 * Validates that walletId is a UUID v4.
 */
export const WalletIdPathSchema = z.object({
  walletId: zUuid,
});

export type WalletIdPathDTO = z.infer<typeof WalletIdPathSchema>;
