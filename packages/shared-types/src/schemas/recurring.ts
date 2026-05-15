import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zDecimalString } from '../money.js';
import { zUuid, zCategoryIdLike } from './common.js';

const zTransactionType = z.enum(['income', 'expense']);

/**
 * Day of the month in `[1, 31]`. If the target month has fewer days
 * (Feb 30 → 28/29), the domain layer clamps to the last day of the month.
 */
const zDayOfMonth = z.number().int().min(1).max(31);

const zCadence = z.literal('monthly');

export const RecurringIdPathSchema = z.object({
  recurringId: zUuid,
});

export type RecurringIdPathDTO = z.infer<typeof RecurringIdPathSchema>;

export const CreateRecurringRequestSchema = z.object({
  walletId: zUuid,
  type: zTransactionType,
  /**
   * Decimal string with exactly 2 decimal places; must be > 0. Cents
   * conversion happens in the handler after the wallet currency is loaded.
   */
  amount: zDecimalString,
  /**
   * Accepts predefined category IDs (e.g. "expense:rent") OR UUID v4.
   * Same surface as Transaction.add.
   */
  categoryId: zCategoryIdLike,
  description: z.string().max(256).optional(),
  dayOfMonth: zDayOfMonth,
});

export type CreateRecurringDTO = z.infer<typeof CreateRecurringRequestSchema>;

/**
 * Partial update body. Strict + at-least-one. Immutable fields (`walletId`,
 * `type`, `currency`, `cadence`) are walled off by Zod strict + the domain's
 * `applyEdits` signature.
 */
export const UpdateRecurringRequestSchema = z
  .object({
    amount: zDecimalString.optional(),
    categoryId: zCategoryIdLike.optional(),
    description: z.union([z.string().max(256), z.null()]).optional(),
    dayOfMonth: zDayOfMonth.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.amount !== undefined ||
      data.categoryId !== undefined ||
      data.description !== undefined ||
      data.dayOfMonth !== undefined,
    { message: 'At least one mutable field must be provided' },
  );

export type UpdateRecurringDTO = z.infer<typeof UpdateRecurringRequestSchema>;

export const RecurringResponseSchema = z.object({
  recurringId: z.string(),
  walletId: z.string(),
  type: zTransactionType,
  /** Decimal string with exactly 2 places. */
  amount: z.string(),
  currency: zCurrency,
  categoryId: z.string(),
  description: z.string().nullable(),
  cadence: zCadence,
  dayOfMonth: z.number().int(),
  nextOccurrenceAt: z.string(),
  lastMaterializedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RecurringResponseDTO = z.infer<typeof RecurringResponseSchema>;

export const ListRecurringResponseSchema = z.object({
  items: z.array(RecurringResponseSchema),
});

export type ListRecurringResponseDTO = z.infer<typeof ListRecurringResponseSchema>;

export const MaterializeRecurringResponseSchema = z.object({
  materializedCount: z.number().int(),
  materializedTransactionIds: z.array(z.string()),
});

export type MaterializeRecurringResponseDTO = z.infer<
  typeof MaterializeRecurringResponseSchema
>;
