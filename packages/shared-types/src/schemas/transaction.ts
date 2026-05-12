import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zIso8601 } from '../date.js';
import { zPaginatedResponse, zLimit, zCursor } from '../pagination.js';
import { zDecimalString } from '../money.js';
import { zCategoryIdLike } from './common.js';

const zTransactionType = z.enum(['income', 'expense']);

/**
 * ISO8601 datetime for occurredAt in a transaction request.
 * Range validation [now-5y, now+1d] is enforced at the domain layer (not here).
 * REQ-TXN-05
 */
export const zOccurredAt = zIso8601;

export const AddTransactionRequestSchema = z.object({
  type: zTransactionType,
  /**
   * Decimal string with exactly 2 decimal places; must be > 0.
   * No .transform() — cents conversion happens in the handler after wallet currency is loaded.
   * REQ-MNY-02, REQ-MNY-03
   */
  amount: zDecimalString,
  /**
   * Accepts predefined category IDs (e.g. "income:salary") OR UUID v4 (custom categories).
   * REQ-VAL-05, REQ-CAT-04
   */
  categoryId: zCategoryIdLike,
  /** ISO8601 datetime — range [now-5y, now+1d] validated by domain */
  occurredAt: zOccurredAt,
  description: z.string().max(256).optional(),
  /**
   * Currency of the wallet this transaction belongs to.
   * The handler uses this to convert the decimal amount to cents before calling the use case.
   * The use case cross-checks against wallet.currency and returns CurrencyMismatch if they differ.
   * REQ-MNY-03, REQ-TXN-04
   */
  currency: zCurrency,
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
