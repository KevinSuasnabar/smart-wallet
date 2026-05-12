import { z } from 'zod';

const zCategoryType = z.enum(['income', 'expense']);

export const CreateCustomCategoryRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name must not be empty')
    .max(32, 'Category name must not exceed 32 characters'),
  type: zCategoryType,
});

export type CreateCustomCategoryDTO = z.infer<typeof CreateCustomCategoryRequestSchema>;

export const CategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
  createdAt: z.string(),
});

export type CategoryResponseDTO = z.infer<typeof CategoryResponseSchema>;

export const PredefinedCategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
});

export type PredefinedCategoryResponseDTO = z.infer<typeof PredefinedCategoryResponseSchema>;

export const ListCategoriesResponseSchema = z.object({
  predefined: z.array(PredefinedCategoryResponseSchema),
  custom: z.array(CategoryResponseSchema),
});

export type ListCategoriesResponseDTO = z.infer<typeof ListCategoriesResponseSchema>;
