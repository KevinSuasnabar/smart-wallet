import { z } from 'zod';
import { zWalletColor } from '../wallet-colors.js';
import { zUuid } from './common.js';

const zCategoryType = z.enum(['income', 'expense']);

export const CreateCustomCategoryRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name must not be empty')
    .max(32, 'Category name must not exceed 32 characters'),
  type: zCategoryType,
  color: zWalletColor,
});

export type CreateCustomCategoryDTO = z.infer<typeof CreateCustomCategoryRequestSchema>;

export const CategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
  color: zWalletColor,
  createdAt: z.string(),
});

export type CategoryResponseDTO = z.infer<typeof CategoryResponseSchema>;

export const PredefinedCategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
  color: zWalletColor,
});

export type PredefinedCategoryResponseDTO = z.infer<typeof PredefinedCategoryResponseSchema>;

export const ListCategoriesResponseSchema = z.object({
  predefined: z.array(PredefinedCategoryResponseSchema),
  custom: z.array(CategoryResponseSchema),
});

export type ListCategoriesResponseDTO = z.infer<typeof ListCategoriesResponseSchema>;

/**
 * Partial update body for PATCH /categories/{categoryId}. Strict + at-least-one.
 * Same shape for editing a custom (in place) and for editing a predefined
 * (which forks into a new custom on the backend).
 */
export const UpdateCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(32).optional(),
    color: zWalletColor.optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.color !== undefined,
    { message: 'At least one mutable field must be provided' },
  );

export type UpdateCategoryDTO = z.infer<typeof UpdateCategoryRequestSchema>;

/**
 * Path parameter schema for routes that reference a specific category. Widened
 * (vs the old custom-only schema) to accept BOTH a UUID v4 (custom) AND a
 * predefined id of the form `(income|expense):slug`. Handler dispatches by
 * the parsed `CategoryId.kind`.
 */
export const CategoryIdPathSchema = z.object({
  categoryId: z.union([
    zUuid,
    z.string().regex(/^(income|expense):[a-z]+$/, 'Invalid category id'),
  ]),
});

export type CategoryIdPathDTO = z.infer<typeof CategoryIdPathSchema>;
