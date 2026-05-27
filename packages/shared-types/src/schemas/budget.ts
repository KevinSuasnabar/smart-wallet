import { z } from 'zod';
import { zCurrency } from '../currencies.js';
import { zUuid } from './common.js';

const zBudgetType = z.enum(['per_category', 'global']);
const zLimitCents = z.number().int().positive();

export const BudgetPathSchema = z.object({
  budgetId: zUuid,
});
export type BudgetPathDTO = z.infer<typeof BudgetPathSchema>;

export const CreateBudgetBodySchema = z.object({
  type: zBudgetType,
  categoryId: zUuid.optional(),
  currency: zCurrency,
  limitCents: zLimitCents,
  rollover: z.boolean().optional(),
});
export type CreateBudgetDTO = z.infer<typeof CreateBudgetBodySchema>;

export const UpdateBudgetBodySchema = z
  .object({
    limitCents: zLimitCents.optional(),
    rollover: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.limitCents !== undefined || data.rollover !== undefined, {
    message: 'At least one mutable field must be provided',
  });
export type UpdateBudgetDTO = z.infer<typeof UpdateBudgetBodySchema>;
