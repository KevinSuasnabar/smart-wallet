import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zIso8601 } from '../date.js';
import { zPaginatedResponse } from '../pagination.js';
import { zLimit, zCursor } from '../pagination.js';

const zTransactionType = z.enum(['income', 'expense']);

/**
 * Amount as a non-negative decimal string with exactly 2 decimal places.
 * Must be > 0 (enforced separately by domain).
 * Cents conversion is NOT done in the schema — the handler does it after
 * fetching the wallet's currency (which is unknown at validation time).
 * REQ-MNY-02, REQ-MNY-03
 */
export const zDecimalAmount = z
  .string()
  .regex(/^\d+\.\d{2}$/, 'Amount must be a decimal with exactly 2 decimal places (e.g. "12.34")');

export const AddTransactionRequestSchema = z.object({
  type: zTransactionType,
  /** Decimal string with exactly 2 decimal places; must be > 0 */
  amount: zDecimalAmount,
  categoryId: z.string().min(1),
  /** ISO8601 datetime — range [now-5y, now+1d] validated by domain */
  occurredAt: zIso8601,
  description: z.string().max(256).optional(),
  currency: zCurrency.optional(),
});

export type AddTransactionDTO = z.infer<typeof AddTransactionRequestSchema>;

export const TransactionResponseSchema = z.object({
  transactionId: z.string(),
  walletId: z.string(),
  type: zTransactionType,
  /** Amount as decimal string with exactly 2 places — REQ-MNY-04 */
  amount: z.string(),
  currency: zCurrency,
  categoryId: z.string(),
  occurredAt: z.string(),
  createdAt: z.string(),
  description: z.string().optional(),
});

export type TransactionResponseDTO = z.infer<typeof TransactionResponseSchema>;

export const ListTransactionsResponseSchema = zPaginatedResponse(TransactionResponseSchema);

export type ListTransactionsResponseDTO = z.infer<typeof ListTransactionsResponseSchema>;

export const ListTransactionsByWalletQuerySchema = z.object({
  from: zIso8601.optional(),
  to: zIso8601.optional(),
  type: zTransactionType.optional(),
  categoryId: z.string().optional(),
  limit: zLimit,
  cursor: zCursor,
});

export type ListTransactionsByWalletQueryDTO = z.infer<typeof ListTransactionsByWalletQuerySchema>;

export const ListTransactionsByCategoryQuerySchema = z.object({
  categoryId: z.string().min(1),
  from: zIso8601.optional(),
  to: zIso8601.optional(),
  limit: zLimit,
  cursor: zCursor,
});

export type ListTransactionsByCategoryQueryDTO = z.infer<
  typeof ListTransactionsByCategoryQuerySchema
>;
